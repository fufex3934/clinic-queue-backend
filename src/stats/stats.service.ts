import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MAX_APPOINTMENTS_PER_SLOT } from '../appointment/constants';
import {
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
} from '../appointment/schemas/appointment.schema';
import { Clinic, ClinicDocument } from '../clinic/schemas/clinic.schema';
import { toStartOfDay } from '../common/utils/date.util';
import {
  dateKeyToStorageDate,
  DEFAULT_CLINIC_TIMEZONE,
  formatShortWeekdayInTimeZone,
  getDayBoundsInTimeZone,
  getTodayInTimeZone,
  shiftDateKey,
} from '../common/utils/timezone-date.util';
import { toObjectId } from '../common/utils/mongo.util';
import { Patient, PatientDocument } from '../patient/schemas/patient.schema';
import { Queue, QueueDocument, QueueStatus } from '../queue/schemas/queue.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  AppointmentDaySeriesPoint,
  ClinicDashboardStats,
  PlatformDashboardStats,
  QueueDaySeriesPoint,
  SlotUtilization,
  StatusCount,
} from './interfaces/dashboard-stats.interface';

const QUEUE_STATUS_LABELS: Record<QueueStatus, string> = {
  [QueueStatus.WAITING]: 'Waiting',
  [QueueStatus.SERVING]: 'Serving',
  [QueueStatus.DONE]: 'Completed',
  [QueueStatus.SKIPPED]: 'Skipped',
};

const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  [AppointmentStatus.SCHEDULED]: 'Scheduled',
  [AppointmentStatus.CONFIRMED]: 'Confirmed',
  [AppointmentStatus.ARRIVED]: 'Arrived',
  [AppointmentStatus.CANCELLED]: 'Cancelled',
  [AppointmentStatus.COMPLETED]: 'Completed',
  [AppointmentStatus.NO_SHOW]: 'No show',
};

@Injectable()
export class StatsService {
  constructor(
    @InjectModel(Patient.name)
    private readonly patientModel: Model<PatientDocument>,
    @InjectModel(Queue.name)
    private readonly queueModel: Model<QueueDocument>,
    @InjectModel(Appointment.name)
    private readonly appointmentModel: Model<AppointmentDocument>,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async getClinicDashboard(clinicId: string): Promise<ClinicDashboardStats> {
    const clinicObjectId = toObjectId(clinicId);
    const clinic = await this.clinicModel.findById(clinicObjectId).exec();
    const timeZone =
      clinic?.timezone?.trim() || DEFAULT_CLINIC_TIMEZONE;
    const todayKey = getTodayInTimeZone(timeZone);
    const today = dateKeyToStorageDate(todayKey);
    const { start: todayStart, end: todayEnd } = getDayBoundsInTimeZone(
      todayKey,
      timeZone,
    );
    const last7Days = this.buildLastNDays(7, timeZone);
    const dayDates = last7Days.map((d) => d.date);

    const slotCapacity =
      clinic?.maxAppointmentsPerSlot ?? MAX_APPOINTMENTS_PER_SLOT;

    const [
      patientsTotal,
      patientsCreatedToday,
      queueStatusTodayRaw,
      queueByDayRaw,
      appointmentsByDayRaw,
      appointmentStatusTodayRaw,
      appointmentsBySlotRaw,
      averageWaitMinutes,
    ] = await Promise.all([
      this.patientModel.countDocuments({ clinicId: clinicObjectId }).exec(),
      this.patientModel
        .countDocuments({
          clinicId: clinicObjectId,
          createdAt: { $gte: todayStart, $lt: todayEnd },
        })
        .exec(),
      this.aggregateQueueStatusToday([clinicObjectId], today),
      this.aggregateQueueByDay([clinicObjectId], dayDates),
      this.aggregateAppointmentsByDay([clinicObjectId], dayDates),
      this.aggregateAppointmentStatusToday([clinicObjectId], today),
      this.appointmentModel
        .aggregate<{ _id: string; count: number }>([
          { $match: { clinicId: clinicObjectId, date: today } },
          { $group: { _id: '$timeSlot', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .exec(),
      this.computeAverageWaitMinutes(clinicObjectId, today),
    ]);

    const queueKpis = this.resolveQueueKpis(queueStatusTodayRaw);
    const appointmentKpis = this.resolveAppointmentKpis(appointmentStatusTodayRaw);

    return {
      scope: 'clinic',
      clinicId,
      generatedAt: new Date().toISOString(),
      today: todayKey,
      timezone: timeZone,
      kpis: {
        patientsTotal,
        patientsCreatedToday,
        ...queueKpis,
        ...appointmentKpis,
        averageWaitMinutes,
      },
      queueLast7Days: this.mapQueueSeries(last7Days, queueByDayRaw),
      appointmentsLast7Days: this.mapAppointmentSeries(
        last7Days,
        appointmentsByDayRaw,
      ),
      queueStatusToday: this.mapQueueStatusToday(queueStatusTodayRaw),
      appointmentStatusToday: this.mapAppointmentStatusToday(
        appointmentStatusTodayRaw,
      ),
      appointmentsBySlotToday: appointmentsBySlotRaw.map((row) => ({
        slot: row._id,
        count: row.count,
        capacity: slotCapacity,
      })),
      peakHoursToday: appointmentsBySlotRaw.map((row) => ({
        slot: row._id,
        count: row.count,
      })),
    };
  }

  async getPlatformDashboard(): Promise<PlatformDashboardStats> {
    const todayKey = getTodayInTimeZone(DEFAULT_CLINIC_TIMEZONE);
    const today = dateKeyToStorageDate(todayKey);
    const last7Days = this.buildLastNDays(7, DEFAULT_CLINIC_TIMEZONE);
    const dayDates = last7Days.map((d) => d.date);

    const clinics = await this.clinicModel.find().sort({ name: 1 }).exec();

    const [
      patientsTotal,
      staffTotal,
      queueStatusTodayRaw,
      queueByDayRaw,
      appointmentsByDayRaw,
      appointmentStatusTodayRaw,
      patientByClinic,
      queueTodayByClinic,
      appointmentsTodayByClinic,
    ] = await Promise.all([
      this.patientModel.countDocuments().exec(),
      this.userModel.countDocuments().exec(),
      this.aggregateQueueStatusToday(null, today),
      this.aggregateQueueByDay(null, dayDates),
      this.aggregateAppointmentsByDay(null, dayDates),
      this.aggregateAppointmentStatusToday(null, today),
      this.patientModel
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          { $group: { _id: '$clinicId', count: { $sum: 1 } } },
        ])
        .exec(),
      this.queueModel
        .aggregate<{
          _id: Types.ObjectId;
          waiting: number;
          total: number;
        }>([
          { $match: { date: today } },
          {
            $group: {
              _id: '$clinicId',
              waiting: {
                $sum: {
                  $cond: [{ $eq: ['$status', QueueStatus.WAITING] }, 1, 0],
                },
              },
              total: { $sum: 1 },
            },
          },
        ])
        .exec(),
      this.appointmentModel
        .aggregate<{ _id: Types.ObjectId; count: number }>([
          { $match: { date: today } },
          { $group: { _id: '$clinicId', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const queueKpis = this.resolveQueueKpis(queueStatusTodayRaw);
    const appointmentKpis = this.resolveAppointmentKpis(appointmentStatusTodayRaw);

    const patientMap = new Map(
      patientByClinic.map((r) => [r._id.toString(), r.count]),
    );
    const queueMap = new Map(
      queueTodayByClinic.map((r) => [r._id.toString(), r]),
    );
    const apptMap = new Map(
      appointmentsTodayByClinic.map((r) => [r._id.toString(), r.count]),
    );

    const clinicsOverview = clinics.map((clinic) => {
      const id = clinic._id.toString();
      const queue = queueMap.get(id);
      return {
        clinicId: id,
        name: clinic.name,
        isActive: clinic.isActive !== false,
        patientsTotal: patientMap.get(id) ?? 0,
        queueWaiting: queue?.waiting ?? 0,
        queueTotalToday: queue?.total ?? 0,
        appointmentsToday: apptMap.get(id) ?? 0,
      };
    });

    const clinicsGrowth = this.buildClinicsGrowthSeries(last7Days, clinics);

    return {
      scope: 'platform',
      generatedAt: new Date().toISOString(),
      today: todayKey,
      kpis: {
        clinicsTotal: clinics.length,
        patientsTotal,
        staffTotal,
        queueWaiting: queueKpis.queueWaiting,
        queueServing: queueKpis.queueServing,
        queueCompletedToday: queueKpis.queueCompletedToday,
        appointmentsToday: appointmentKpis.appointmentsToday,
        appointmentsArrivedToday: appointmentKpis.appointmentsArrivedToday,
      },
      clinicsOverview,
      clinicsGrowth,
      queueLast7Days: this.mapQueueSeries(last7Days, queueByDayRaw),
      appointmentsLast7Days: this.mapAppointmentSeries(
        last7Days,
        appointmentsByDayRaw,
      ),
      queueStatusToday: this.mapQueueStatusToday(queueStatusTodayRaw),
      appointmentStatusToday: this.mapAppointmentStatusToday(
        appointmentStatusTodayRaw,
      ),
    };
  }

  private aggregateQueueStatusToday(
    clinicIds: Types.ObjectId[] | null,
    today: Date,
  ) {
    const match: Record<string, unknown> = { date: today };
    if (clinicIds?.length) {
      match.clinicId = { $in: clinicIds };
    }
    return this.queueModel
      .aggregate<{ _id: QueueStatus; count: number }>([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();
  }

  private aggregateQueueByDay(
    clinicIds: Types.ObjectId[] | null,
    dayDates: Date[],
  ) {
    const match: Record<string, unknown> = { date: { $in: dayDates } };
    if (clinicIds?.length) {
      match.clinicId = { $in: clinicIds };
    }
    return this.queueModel
      .aggregate<{ _id: Date; total: number; completed: number }>([
        { $match: match },
        {
          $group: {
            _id: '$date',
            total: { $sum: 1 },
            completed: {
              $sum: {
                $cond: [{ $eq: ['$status', QueueStatus.DONE] }, 1, 0],
              },
            },
          },
        },
      ])
      .exec();
  }

  private aggregateAppointmentsByDay(
    clinicIds: Types.ObjectId[] | null,
    dayDates: Date[],
  ) {
    const match: Record<string, unknown> = { date: { $in: dayDates } };
    if (clinicIds?.length) {
      match.clinicId = { $in: clinicIds };
    }
    return this.appointmentModel
      .aggregate<{
        _id: Date;
        total: number;
        arrived: number;
        cancelled: number;
      }>([
        { $match: match },
        {
          $group: {
            _id: '$date',
            total: { $sum: 1 },
            arrived: {
              $sum: {
                $cond: [{ $eq: ['$status', AppointmentStatus.ARRIVED] }, 1, 0],
              },
            },
            cancelled: {
              $sum: {
                $cond: [
                  { $eq: ['$status', AppointmentStatus.CANCELLED] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .exec();
  }

  private aggregateAppointmentStatusToday(
    clinicIds: Types.ObjectId[] | null,
    today: Date,
  ) {
    const match: Record<string, unknown> = { date: today };
    if (clinicIds?.length) {
      match.clinicId = { $in: clinicIds };
    }
    return this.appointmentModel
      .aggregate<{ _id: AppointmentStatus; count: number }>([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();
  }

  private resolveQueueKpis(
    queueStatusTodayRaw: { _id: QueueStatus; count: number }[],
  ) {
    const queueStatusMap = new Map(
      queueStatusTodayRaw.map((r) => [r._id, r.count]),
    );
    const queueWaiting = queueStatusMap.get(QueueStatus.WAITING) ?? 0;
    const queueServing = queueStatusMap.get(QueueStatus.SERVING) ?? 0;
    const queueCompletedToday = queueStatusMap.get(QueueStatus.DONE) ?? 0;
    return {
      queueWaiting,
      queueServing,
      queueCompletedToday,
      queueTotalToday: queueWaiting + queueServing + queueCompletedToday,
    };
  }

  private resolveAppointmentKpis(
    appointmentStatusTodayRaw: { _id: AppointmentStatus; count: number }[],
  ) {
    const appointmentStatusMap = new Map(
      appointmentStatusTodayRaw.map((r) => [r._id, r.count]),
    );
    const appointmentsToday = appointmentStatusTodayRaw.reduce(
      (sum, r) => sum + r.count,
      0,
    );
    return {
      appointmentsToday,
      appointmentsArrivedToday:
        appointmentStatusMap.get(AppointmentStatus.ARRIVED) ?? 0,
      appointmentsScheduledToday:
        (appointmentStatusMap.get(AppointmentStatus.SCHEDULED) ?? 0) +
        (appointmentStatusMap.get(AppointmentStatus.CONFIRMED) ?? 0),
    };
  }

  private mapQueueSeries(
    last7Days: { date: Date; label: string; dateKey: string }[],
    queueByDayRaw: { _id: Date; total: number; completed: number }[],
  ): QueueDaySeriesPoint[] {
    const queueByDayMap = new Map(
      queueByDayRaw.map((r) => [r._id.toISOString(), r]),
    );
    return last7Days.map(({ date, label, dateKey }) => {
      const row = queueByDayMap.get(date.toISOString());
      return {
        date: dateKey,
        label,
        total: row?.total ?? 0,
        completed: row?.completed ?? 0,
      };
    });
  }

  private mapAppointmentSeries(
    last7Days: { date: Date; label: string; dateKey: string }[],
    appointmentsByDayRaw: {
      _id: Date;
      total: number;
      arrived: number;
      cancelled: number;
    }[],
  ): AppointmentDaySeriesPoint[] {
    const appointmentsByDayMap = new Map(
      appointmentsByDayRaw.map((r) => [r._id.toISOString(), r]),
    );
    return last7Days.map(({ date, label, dateKey }) => {
      const row = appointmentsByDayMap.get(date.toISOString());
      return {
        date: dateKey,
        label,
        total: row?.total ?? 0,
        arrived: row?.arrived ?? 0,
        cancelled: row?.cancelled ?? 0,
      };
    });
  }

  private mapQueueStatusToday(
    queueStatusTodayRaw: { _id: QueueStatus; count: number }[],
  ): StatusCount[] {
    const queueStatusMap = new Map(
      queueStatusTodayRaw.map((r) => [r._id, r.count]),
    );
    return (Object.values(QueueStatus) as QueueStatus[]).map((status) => ({
      status,
      label: QUEUE_STATUS_LABELS[status],
      count: queueStatusMap.get(status) ?? 0,
    }));
  }

  private mapAppointmentStatusToday(
    appointmentStatusTodayRaw: { _id: AppointmentStatus; count: number }[],
  ): StatusCount[] {
    const appointmentStatusMap = new Map(
      appointmentStatusTodayRaw.map((r) => [r._id, r.count]),
    );
    return (Object.values(AppointmentStatus) as AppointmentStatus[])
      .map((status) => ({
        status,
        label: APPOINTMENT_STATUS_LABELS[status],
        count: appointmentStatusMap.get(status) ?? 0,
      }))
      .filter((row) => row.count > 0);
  }

  private async computeAverageWaitMinutes(
    clinicObjectId: Types.ObjectId,
    today: Date,
  ): Promise<number | null> {
    const rows = await this.queueModel
      .find({
        clinicId: clinicObjectId,
        date: today,
        status: QueueStatus.DONE,
      })
      .select('createdAt updatedAt')
      .exec();

    if (rows.length === 0) {
      return null;
    }

    const totalMs = rows.reduce((sum, row) => {
      const doc = row as typeof row & { createdAt?: Date; updatedAt?: Date };
      const start = doc.createdAt?.getTime() ?? 0;
      const end = doc.updatedAt?.getTime() ?? start;
      return sum + Math.max(0, end - start);
    }, 0);

    return Math.round(totalMs / rows.length / 60_000);
  }

  private buildClinicsGrowthSeries(
    last7Days: { date: Date; label: string; dateKey: string }[],
    clinics: ClinicDocument[],
  ) {
    return last7Days.map(({ date, label, dateKey }) => {
      const end = this.addUtcDays(date, 1);
      const total = clinics.filter((c) => {
        const doc = c as ClinicDocument & { createdAt?: Date };
        return doc.createdAt && doc.createdAt < end;
      }).length;
      return { date: dateKey, label, total };
    });
  }

  private addUtcDays(base: Date, offset: number): Date {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + offset);
    return d;
  }

  private buildLastNDays(
    n: number,
    timeZone: string = DEFAULT_CLINIC_TIMEZONE,
  ): {
    date: Date;
    dateKey: string;
    label: string;
  }[] {
    const days: { date: Date; dateKey: string; label: string }[] = [];
    const todayKey = getTodayInTimeZone(timeZone);

    for (let offset = n - 1; offset >= 0; offset -= 1) {
      const dateKey = shiftDateKey(todayKey, -offset);
      const date = dateKeyToStorageDate(dateKey);
      days.push({
        date,
        dateKey,
        label: formatShortWeekdayInTimeZone(dateKey, timeZone),
      });
    }

    return days;
  }
}
