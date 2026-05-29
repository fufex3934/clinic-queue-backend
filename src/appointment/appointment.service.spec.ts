import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { Appointment, AppointmentStatus } from './schemas/appointment.schema';
import { PatientService } from '../patient/patient.service';
import { QueueService } from '../queue/queue.service';
import { MAX_APPOINTMENTS_PER_SLOT } from './constants';

describe('AppointmentService slot limits', () => {
  let service: AppointmentService;
  const appointmentModel = {
    countDocuments: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
  };
  const patientService = { existsInClinic: jest.fn().mockResolvedValue(true) };
  const queueService = {};
  const connection = { startSession: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentService,
        { provide: getModelToken(Appointment.name), useValue: appointmentModel },
        { provide: PatientService, useValue: patientService },
        { provide: QueueService, useValue: queueService },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get(AppointmentService);
  });

  it('rejects booking when slot is full (5 active)', async () => {
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn(),
    };
    connection.startSession.mockResolvedValue(session);
    appointmentModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(MAX_APPOINTMENTS_PER_SLOT),
    });

    await expect(
      service.book('507f1f77bcf86cd799439011', {
        patientId: '507f1f77bcf86cd799439012',
        date: '2026-06-01',
        timeSlot: '09:00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows booking when slot has capacity', async () => {
    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => {
        await fn();
      }),
      endSession: jest.fn(),
    };
    connection.startSession.mockResolvedValue(session);
    appointmentModel.countDocuments.mockReturnValue({
      exec: jest.fn().mockResolvedValue(MAX_APPOINTMENTS_PER_SLOT - 1),
    });
    appointmentModel.create.mockResolvedValue([
      {
        _id: 'appt1',
        status: AppointmentStatus.SCHEDULED,
      },
    ]);
    appointmentModel.findOne.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'appt1' }),
      }),
    });

    const result = await service.book('507f1f77bcf86cd799439011', {
      patientId: '507f1f77bcf86cd799439012',
      date: '2026-06-01',
      timeSlot: '10:00',
    });

    expect(result).toBeDefined();
    expect(appointmentModel.countDocuments).toHaveBeenCalled();
  });
});
