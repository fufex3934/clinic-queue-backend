import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { toObjectId } from '../common/utils/mongo.util';
import { PatientService } from '../patient/patient.service';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import {
  QueueCounter,
  QueueCounterDocument,
} from './schemas/queue-counter.schema';
import { Queue, QueueDocument, QueueStatus } from './schemas/queue.schema';
import { resolveClinicDayScope } from './utils/queue-scope.util';

@Injectable()
export class QueueService {
  constructor(
    @InjectModel(Queue.name)
    private readonly queueModel: Model<QueueDocument>,
    @InjectModel(QueueCounter.name)
    private readonly counterModel: Model<QueueCounterDocument>,
    private readonly patientService: PatientService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  /**
   * Atomically issues the next token for this clinic + day only.
   * Counter document key: scopeKey = `${clinicId}:${YYYY-MM-DD}`.
   */
  private async issueNextToken(
    scope: ReturnType<typeof resolveClinicDayScope>,
  ): Promise<number> {
    const counter = await this.counterModel
      .findOneAndUpdate(
        { scopeKey: scope.scopeKey },
        {
          $inc: { lastToken: 1 },
          $setOnInsert: {
            scopeKey: scope.scopeKey,
            clinicId: scope.clinicObjectId,
            dateKey: scope.dateKey,
          },
        },
        { new: true, upsert: true },
      )
      .exec();

    if (!counter || counter.lastToken < 1) {
      throw new InternalServerErrorException('Failed to generate token number');
    }

    return counter.lastToken;
  }

  async add(clinicId: string, addToQueueDto: AddToQueueDto) {
    const scope = resolveClinicDayScope(clinicId);
    const patientObjectId = toObjectId(addToQueueDto.patientId);

    const patientInClinic = await this.patientService.existsInClinic(
      addToQueueDto.patientId,
      clinicId,
    );
    if (!patientInClinic) {
      throw new NotFoundException(`Patient ${addToQueueDto.patientId} not found`);
    }

    const alreadyWaiting = await this.queueModel.exists({
      clinicId: scope.clinicObjectId,
      date: scope.date,
      patientId: patientObjectId,
      status: QueueStatus.WAITING,
    });
    if (alreadyWaiting) {
      throw new ConflictException('Patient is already in today\'s waiting queue');
    }

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tokenNumber = await this.issueNextToken(scope);

      try {
        const entry = await this.queueModel.create({
          clinicId: scope.clinicObjectId,
          patientId: patientObjectId,
          date: scope.date,
          tokenNumber,
          status: QueueStatus.WAITING,
        });
        await entry.populate('patientId', 'name phone');
        return entry;
      } catch (error: unknown) {
        if (this.isDuplicateKeyError(error) && attempt < maxAttempts - 1) {
          continue;
        }
        if (this.isDuplicateKeyError(error)) {
          throw new ConflictException(
            `Token ${tokenNumber} already exists for today; please retry`,
          );
        }
        const message =
          error instanceof Error ? error.message : 'Failed to add patient to queue';
        throw new InternalServerErrorException(message);
      }
    }

    throw new InternalServerErrorException('Failed to add patient to queue');
  }

  async getToday(clinicId: string) {
    const scope = resolveClinicDayScope(clinicId);
    return this.queueModel
      .find({ clinicId: scope.clinicObjectId, date: scope.date })
      .sort({ tokenNumber: 1 })
      .populate('patientId', 'name phone')
      .exec();
  }

  /**
   * Transaction: complete current serving patient, then promote exactly one
   * waiting patient (lowest token) to serving — prevents dual-serving races.
   */
  async serveNext(clinicId: string): Promise<QueueDocument> {
    const scope = resolveClinicDayScope(clinicId);
    const session = await this.connection.startSession();

    try {
      const entry = await session.withTransaction(async () => {
        await this.queueModel
          .updateMany(
            {
              clinicId: scope.clinicObjectId,
              date: scope.date,
              status: QueueStatus.SERVING,
            },
            { status: QueueStatus.DONE },
            { session },
          )
          .exec();

        return this.queueModel
          .findOneAndUpdate(
            {
              clinicId: scope.clinicObjectId,
              date: scope.date,
              status: QueueStatus.WAITING,
            },
            { status: QueueStatus.SERVING },
            { new: true, sort: { tokenNumber: 1 }, session },
          )
          .populate('patientId', 'name phone')
          .exec();
      });

      if (!entry) {
        throw new NotFoundException('No patients waiting in today\'s queue');
      }

      return entry;
    } finally {
      await session.endSession();
    }
  }

  async skipEntry(clinicId: string, entryId: string) {
    const entry = await this.findTodayEntry(clinicId, entryId);
    if (entry.status !== QueueStatus.WAITING) {
      throw new ConflictException('Only waiting patients can be skipped');
    }
    entry.status = QueueStatus.SKIPPED;
    await entry.save();
    await entry.populate('patientId', 'name phone');
    return entry;
  }

  async removeEntry(clinicId: string, entryId: string) {
    const entry = await this.findTodayEntry(clinicId, entryId);
    if (entry.status === QueueStatus.SERVING) {
      throw new ConflictException(
        'Cannot remove the patient currently being served',
      );
    }
    await entry.deleteOne();
    return { deleted: true, id: entryId };
  }

  async forceServeEntry(clinicId: string, entryId: string) {
    const scope = resolveClinicDayScope(clinicId);
    const session = await this.connection.startSession();

    try {
      const entry = await session.withTransaction(async () => {
        await this.queueModel
          .updateMany(
            {
              clinicId: scope.clinicObjectId,
              date: scope.date,
              status: QueueStatus.SERVING,
            },
            { status: QueueStatus.DONE },
            { session },
          )
          .exec();

        return this.queueModel
          .findOneAndUpdate(
            {
              _id: toObjectId(entryId),
              clinicId: scope.clinicObjectId,
              date: scope.date,
              status: { $in: [QueueStatus.WAITING, QueueStatus.SKIPPED] },
            },
            { status: QueueStatus.SERVING },
            { new: true, session },
          )
          .populate('patientId', 'name phone')
          .exec();
      });

      if (!entry) {
        throw new NotFoundException(
          'Queue entry not found or cannot be served (must be waiting or skipped)',
        );
      }

      return entry;
    } finally {
      await session.endSession();
    }
  }

  async reorderWaiting(clinicId: string, orderedEntryIds: string[]) {
    const scope = resolveClinicDayScope(clinicId);
    const uniqueIds = [...new Set(orderedEntryIds)];

    const waiting = await this.queueModel
      .find({
        clinicId: scope.clinicObjectId,
        date: scope.date,
        status: QueueStatus.WAITING,
      })
      .sort({ tokenNumber: 1 })
      .exec();

    if (uniqueIds.length !== waiting.length) {
      throw new BadRequestException(
        'orderedEntryIds must include every waiting entry exactly once',
      );
    }

    const waitingIdSet = new Set(waiting.map((e) => e._id.toString()));
    for (const id of uniqueIds) {
      if (!waitingIdSet.has(id)) {
        throw new BadRequestException(
          `Queue entry ${id} is not in today's waiting list`,
        );
      }
    }

    const tokenNumbers = waiting.map((e) => e.tokenNumber).sort((a, b) => a - b);
    const session = await this.connection.startSession();

    try {
      await session.withTransaction(async () => {
        for (let i = 0; i < uniqueIds.length; i++) {
          await this.queueModel
            .updateOne(
              { _id: toObjectId(uniqueIds[i]) },
              { tokenNumber: tokenNumbers[i] },
              { session },
            )
            .exec();
        }
      });
    } finally {
      await session.endSession();
    }

    return this.getToday(clinicId);
  }

  private async findTodayEntry(clinicId: string, entryId: string) {
    const scope = resolveClinicDayScope(clinicId);
    const entry = await this.queueModel
      .findOne({
        _id: toObjectId(entryId),
        clinicId: scope.clinicObjectId,
        date: scope.date,
      })
      .exec();

    if (!entry) {
      throw new NotFoundException(`Queue entry ${entryId} not found for today`);
    }

    return entry;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: number }).code === 11000
    );
  }
}
