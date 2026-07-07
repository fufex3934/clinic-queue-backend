import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { InternalServerErrorException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  dateKeyToStorageDate,
  getTodayInTimeZone,
} from '../common/utils/timezone-date.util';
import { Clinic } from '../clinic/schemas/clinic.schema';
import { PatientService } from '../patient/patient.service';
import { QueueService } from '../queue/queue.service';
import { AppointmentService } from './appointment.service';
import { Appointment, AppointmentStatus } from './schemas/appointment.schema';

describe('AppointmentService arrive (atomic check-in)', () => {
  const clinicId = '507f1f77bcf86cd799439011';
  const appointmentId = '507f1f77bcf86cd799439012';
  const patientId = '507f1f77bcf86cd799439013';
  const todayStorage = dateKeyToStorageDate(getTodayInTimeZone());

  let service: AppointmentService;
  let appointmentStatus: AppointmentStatus;
  let queueEntryCreated: boolean;

  const appointmentModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };
  const clinicModel = {
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ timezone: 'Africa/Addis_Ababa' }),
        }),
      }),
    }),
  };
  const patientService = { existsInClinic: jest.fn() };
  const queueService = {
    add: jest.fn(),
    notifyTokenIssued: jest.fn(),
  };
  const connection = { startSession: jest.fn() };

  function createSession() {
    return {
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => {
        const statusBefore = appointmentStatus;
        const queueBefore = queueEntryCreated;
        try {
          return await fn();
        } catch (error) {
          appointmentStatus = statusBefore;
          queueEntryCreated = queueBefore;
          throw error;
        }
      }),
      endSession: jest.fn(),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    appointmentStatus = AppointmentStatus.SCHEDULED;
    queueEntryCreated = false;

    appointmentModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        status: AppointmentStatus.SCHEDULED,
        date: todayStorage,
        patientId: { toString: () => patientId },
      }),
    });

    appointmentModel.findOneAndUpdate.mockImplementation(
      (_filter, update: { status: AppointmentStatus }, opts?: { session?: unknown }) => ({
        exec: jest.fn().mockImplementation(async () => {
          if (!opts?.session) return null;
          appointmentStatus = update.status;
          return {
            status: update.status,
            populate: jest.fn().mockResolvedValue({ status: update.status }),
          };
        }),
      }),
    );

    queueService.add.mockImplementation(async (_clinicId, _dto, options) => {
      if (options?.session) {
        queueEntryCreated = true;
      }
      return {
        _id: 'queue-entry-1',
        populate: jest.fn().mockResolvedValue(undefined),
      };
    });

    connection.startSession.mockResolvedValue(createSession());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: getModelToken(Appointment.name), useValue: appointmentModel },
        { provide: getModelToken(Clinic.name), useValue: clinicModel },
        { provide: PatientService, useValue: patientService },
        { provide: QueueService, useValue: queueService },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get(AppointmentService);
  });

  it('marks appointment arrived and adds patient to queue', async () => {
    const result = await service.arrive(clinicId, appointmentId);

    expect(result.appointment.status).toBe(AppointmentStatus.ARRIVED);
    expect(queueEntryCreated).toBe(true);
    expect(queueService.add).toHaveBeenCalledWith(
      clinicId,
      { patientId },
      expect.objectContaining({ session: expect.anything() }),
    );
    expect(queueService.notifyTokenIssued).toHaveBeenCalled();
    expect(appointmentStatus).toBe(AppointmentStatus.ARRIVED);
  });

  it('does not persist changes when queue add fails', async () => {
    queueService.add.mockRejectedValueOnce(new Error('forced queue failure'));

    await expect(service.arrive(clinicId, appointmentId)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(appointmentStatus).toBe(AppointmentStatus.SCHEDULED);
    expect(queueEntryCreated).toBe(false);
    expect(queueService.notifyTokenIssued).not.toHaveBeenCalled();
  });
});
