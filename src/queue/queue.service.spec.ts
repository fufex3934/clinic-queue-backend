import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { QueueService } from './queue.service';
import { Queue } from './schemas/queue.schema';
import { QueueCounter } from './schemas/queue-counter.schema';
import { PatientService } from '../patient/patient.service';

describe('QueueService', () => {
  let service: QueueService;

  const mockQueueModel = {
    exists: jest.fn(),
    create: jest.fn(),
    find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ populate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }) }),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn().mockReturnValue({ exec: jest.fn() }),
  };

  const mockCounterModel = {
    findOneAndUpdate: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue({ lastToken: 1 }),
    }),
  };

  const mockConnection = {
    startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (fn: () => Promise<unknown>) => fn()),
      endSession: jest.fn(),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueService,
        { provide: getModelToken(Queue.name), useValue: mockQueueModel },
        { provide: getModelToken(QueueCounter.name), useValue: mockCounterModel },
        {
          provide: PatientService,
          useValue: { existsInClinic: jest.fn().mockResolvedValue(true) },
        },
        { provide: getConnectionToken(), useValue: mockConnection },
      ],
    }).compile();

    service = module.get(QueueService);
    jest.clearAllMocks();
  });

  it('add creates a waiting entry with token', async () => {
    const populated = {
      _id: 'entry1',
      tokenNumber: 1,
      status: 'waiting',
      populate: jest.fn().mockResolvedValue(undefined),
    };
    mockQueueModel.exists.mockResolvedValue(null);
    mockQueueModel.create.mockResolvedValue(populated);

    const result = await service.add('507f1f77bcf86cd799439011', {
      patientId: '507f1f77bcf86cd799439012',
    });

    expect(mockQueueModel.create).toHaveBeenCalled();
    expect(result.tokenNumber).toBe(1);
  });
});
