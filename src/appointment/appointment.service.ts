import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { toStartOfDay } from '../common/utils/date.util';
import {
  dateKeyToStorageDate,
  getTodayInTimeZone,
} from '../common/utils/timezone-date.util';
import { toObjectId } from '../common/utils/mongo.util';
import { assertTimeSlotWithinWorkingHours } from '../common/utils/working-hours.util';
import { Clinic, ClinicDocument } from '../clinic/schemas/clinic.schema';
import { PatientService } from '../patient/patient.service';
import { QueueService } from '../queue/queue.service';
import { MAX_APPOINTMENTS_PER_SLOT } from './constants';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from './schemas/appointment.schema';
import {
  AppointmentSlotScope,
  buildDayFilter,
  buildSlotFilter,
  normalizeTimeSlot,
  resolveAppointmentDayScope,
  resolveAppointmentSlotScope,
} from './utils/appointment-scope.util';

const ACTIVE_SLOT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.ARRIVED,
];

@Injectable()
export class AppointmentService {
  constructor(
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
    private readonly patientService: PatientService,
    private readonly queueService: QueueService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Max 5 active appointments per clinic + date + timeSlot (not shared across clinics).
   */
  async book(clinicId: string, bookAppointmentDto: BookAppointmentDto) {
    const patientInClinic = await this.patientService.existsInClinic(
      bookAppointmentDto.patientId,
      clinicId,
    );
    if (!patientInClinic) {
      throw new NotFoundException(
        `Patient ${bookAppointmentDto.patientId} not found`,
      );
    }

    const slotScope = resolveAppointmentSlotScope(
      clinicId,
      bookAppointmentDto.date,
      bookAppointmentDto.timeSlot,
    );

    const clinic = await this.clinicModel.findById(slotScope.clinicObjectId).exec();
    if (!clinic) {
      throw new NotFoundException(`Clinic ${clinicId} not found`);
    }
    assertTimeSlotWithinWorkingHours(
      slotScope.timeSlot,
      clinic.workingHoursStart ?? '09:00',
      clinic.workingHoursEnd ?? '17:00',
    );

    const session = await this.connection.startSession();
    let appointmentId: Types.ObjectId | null = null;

    try {
      await session.withTransaction(async () => {
        await this.assertSlotAvailable(slotScope, session);

        const [doc] = await this.appointmentModel.create(
          [
            {
              clinicId: slotScope.clinicObjectId,
              patientId: toObjectId(bookAppointmentDto.patientId),
              date: slotScope.date,
              timeSlot: slotScope.timeSlot,
              status: AppointmentStatus.SCHEDULED,
            },
          ],
          { session },
        );
        appointmentId = doc._id as Types.ObjectId;
      });

      if (!appointmentId) {
        throw new InternalServerErrorException('Failed to book appointment');
      }

      return this.loadAppointment(clinicId, appointmentId);
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to book appointment');
    } finally {
      await session.endSession();
    }
  }

  findByDate(clinicId: string, dateInput: string, timeSlot?: string) {
    const dayScope = resolveAppointmentDayScope(clinicId, dateInput);
    const filter = buildDayFilter({
      ...dayScope,
      timeSlot: timeSlot ? normalizeTimeSlot(timeSlot) : undefined,
    });

    return this.appointmentModel
      .find(filter)
      .sort({ timeSlot: 1, createdAt: 1 })
      .populate('patientId', 'name phone')
      .exec();
  }

  /**
   * Marks appointment as arrived and adds the patient to today's queue for this clinic.
   */
  async arrive(clinicId: string, appointmentId: string) {
    const appointment = await this.findOneInClinic(clinicId, appointmentId);
    if (!appointment) {
      throw new NotFoundException(`Appointment ${appointmentId} not found`);
    }

    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.NO_SHOW
    ) {
      throw new ConflictException(
        `Cannot check in appointment with status '${appointment.status}'`,
      );
    }

    if (appointment.status === AppointmentStatus.ARRIVED) {
      throw new ConflictException('Appointment is already checked in');
    }

    const clinic = await this.clinicModel
      .findById(toObjectId(clinicId))
      .select('timezone')
      .lean()
      .exec();
    const timeZone = clinic?.timezone?.trim() || 'Africa/Addis_Ababa';
    const todayKey = getTodayInTimeZone(timeZone);
    const todayStorage = dateKeyToStorageDate(todayKey);
    if (appointment.date.getTime() !== todayStorage.getTime()) {
      throw new BadRequestException(
        'Check-in is only allowed on the appointment day',
      );
    }

    const patientId = appointment.patientId.toString();
    const queueEntry = await this.queueService.add(clinicId, { patientId });

    appointment.status = AppointmentStatus.ARRIVED;
    await appointment.save();

    return {
      appointment: await appointment.populate('patientId', 'name phone'),
      queueEntry,
    };
  }

  async confirm(clinicId: string, appointmentId: string) {
    return this.transitionStatus(
      clinicId,
      appointmentId,
      [AppointmentStatus.SCHEDULED],
      AppointmentStatus.CONFIRMED,
    );
  }

  async complete(clinicId: string, appointmentId: string) {
    return this.transitionStatus(
      clinicId,
      appointmentId,
      [
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CONFIRMED,
        AppointmentStatus.ARRIVED,
      ],
      AppointmentStatus.COMPLETED,
    );
  }

  async markNoShow(clinicId: string, appointmentId: string) {
    return this.transitionStatus(
      clinicId,
      appointmentId,
      [AppointmentStatus.SCHEDULED, AppointmentStatus.CONFIRMED],
      AppointmentStatus.NO_SHOW,
    );
  }

  async cancel(clinicId: string, appointmentId: string) {
    const appointment = await this.findOneInClinic(clinicId, appointmentId);
    if (!appointment) {
      throw new NotFoundException(`Appointment ${appointmentId} not found`);
    }

    if (
      appointment.status === AppointmentStatus.CANCELLED ||
      appointment.status === AppointmentStatus.COMPLETED ||
      appointment.status === AppointmentStatus.ARRIVED
    ) {
      throw new ConflictException(
        `Cannot cancel appointment with status ${appointment.status}`,
      );
    }

    appointment.status = AppointmentStatus.CANCELLED;
    await appointment.save();
    return appointment.populate('patientId', 'name phone');
  }

  private async assertSlotAvailable(
    slotScope: AppointmentSlotScope,
    session: ClientSession,
  ): Promise<void> {
    const activeCount = await this.countActiveInSlot(slotScope, session);
    const maxPerSlot = await this.getMaxAppointmentsPerSlot(
      slotScope.clinicObjectId,
    );

    if (activeCount >= maxPerSlot) {
      throw new ConflictException(
        `Time slot ${slotScope.timeSlot} is full for this clinic (${maxPerSlot} appointments)`,
      );
    }
  }

  private async getMaxAppointmentsPerSlot(
    clinicObjectId: Types.ObjectId,
  ): Promise<number> {
    const clinic = await this.clinicModel
      .findById(clinicObjectId)
      .select('maxAppointmentsPerSlot')
      .exec();
    return clinic?.maxAppointmentsPerSlot ?? MAX_APPOINTMENTS_PER_SLOT;
  }

  private countActiveInSlot(
    slotScope: AppointmentSlotScope,
    session?: ClientSession,
  ) {
    return this.appointmentModel
      .countDocuments(
        {
          ...buildSlotFilter(slotScope),
          status: { $in: ACTIVE_SLOT_STATUSES },
        },
        session ? { session } : undefined,
      )
      .exec();
  }

  private async transitionStatus(
    clinicId: string,
    appointmentId: string,
    allowedFrom: AppointmentStatus[],
    target: AppointmentStatus,
  ) {
    const appointment = await this.findOneInClinic(clinicId, appointmentId);
    if (!appointment) {
      throw new NotFoundException(`Appointment ${appointmentId} not found`);
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new ConflictException('Completed appointments cannot be changed');
    }

    if (
      target === AppointmentStatus.CONFIRMED &&
      appointment.status === AppointmentStatus.CANCELLED
    ) {
      throw new ConflictException('Cannot confirm a cancelled appointment');
    }

    if (!allowedFrom.includes(appointment.status)) {
      throw new ConflictException(
        `Cannot change status from '${appointment.status}' to '${target}'`,
      );
    }

    appointment.status = target;
    await appointment.save();
    return appointment.populate('patientId', 'name phone');
  }

  private async findOneInClinic(clinicId: string, appointmentId: string) {
    return this.appointmentModel
      .findOne({
        _id: toObjectId(appointmentId),
        clinicId: toObjectId(clinicId),
      })
      .exec();
  }

  private async loadAppointment(clinicId: string, appointmentId: Types.ObjectId) {
    const appointment = await this.appointmentModel
      .findOne({
        _id: appointmentId,
        clinicId: toObjectId(clinicId),
      })
      .populate('patientId', 'name phone')
      .exec();

    if (!appointment) {
      throw new InternalServerErrorException('Failed to book appointment');
    }

    return appointment;
  }
}
