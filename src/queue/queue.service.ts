import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import { SmsService } from '../common/sms/sms.service';
import { toObjectId } from '../common/utils/mongo.util';
import { ClinicService } from '../clinic/clinic.service';
import { PatientService } from '../patient/patient.service';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import {
  QueueCounter,
  QueueCounterDocument,
} from './schemas/queue-counter.schema';
import { Queue, QueueDocument, QueueStatus } from './schemas/queue.schema';
import { resolveClinicDayScope } from './utils/queue-scope.util';

export type AddToQueueOptions = {
  session?: ClientSession;
};

@Injectable()
export class QueueService {
  constructor(
    @InjectModel(Queue.name)
    private readonly queueModel: Model<QueueDocument>,
    @InjectModel(QueueCounter.name)
    private readonly counterModel: Model<QueueCounterDocument>,
    private readonly patientService: PatientService,
    private readonly clinicService: ClinicService,
    private readonly smsService: SmsService,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private async dayScope(clinicId: string) {
    const timeZone = await this.clinicService.getTimezone(clinicId);
    return resolveClinicDayScope(clinicId, timeZone);
  }

  private patientPhone(entry: QueueDocument): string | null {
    const patient = entry.patientId;
    if (
      patient &&
      typeof patient === 'object' &&
      'phone' in patient &&
      typeof (patient as { phone?: string }).phone === 'string'
    ) {
      return (patient as { phone: string }).phone;
    }
    return null;
  }

  private queueSms(
    clinicId: string,
    entry: QueueDocument,
    kind: 'token' | 'serving',
  ): void {
    const phone = this.patientPhone(entry);
    if (!phone) return;
    void this.clinicService.getDisplayName(clinicId).then((clinicName) => {
      const send =
        kind === 'token'
          ? this.smsService.notifyQueueToken(
              phone,
              clinicName,
              entry.tokenNumber,
            )
          : this.smsService.notifyNowServing(
              phone,
              clinicName,
              entry.tokenNumber,
            );
      void send.catch(() => undefined);
    });
  }

  /**
   * Atomically issues the next token for this clinic + day only.
   * Counter document key: scopeKey = `${clinicId}:${YYYY-MM-DD}`.
   */
  private async issueNextToken(
    scope: ReturnType<typeof resolveClinicDayScope>,
    session?: ClientSession,
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
        { new: true, upsert: true, ...(session ? { session } : {}) },
      )
      .exec();

    if (!counter || counter.lastToken < 1) {
      throw new InternalServerErrorException('Failed to generate token number');
    }

    return counter.lastToken;
  }

  /** Post-commit SMS when add() ran inside a transaction. */
  notifyTokenIssued(clinicId: string, entry: QueueDocument): void {
    this.queueSms(clinicId, entry, 'token');
  }

  async add(
    clinicId: string,
    addToQueueDto: AddToQueueDto,
    options?: AddToQueueOptions,
  ) {
    const session = options?.session;
    const scope = await this.dayScope(clinicId);
    const patientObjectId = toObjectId(addToQueueDto.patientId);

    const patientInClinic = await this.patientService.existsInClinic(
      addToQueueDto.patientId,
      clinicId,
    );
    if (!patientInClinic) {
      throw new NotFoundException(`Patient ${addToQueueDto.patientId} not found`);
    }

    const waitingFilter = {
      clinicId: scope.clinicObjectId,
      date: scope.date,
      patientId: patientObjectId,
      status: QueueStatus.WAITING,
    };
    const alreadyWaiting = session
      ? await this.queueModel.exists(waitingFilter).session(session).exec()
      : await this.queueModel.exists(waitingFilter).exec();
    if (alreadyWaiting) {
      throw new ConflictException('Patient is already in today\'s waiting queue');
    }

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const tokenNumber = await this.issueNextToken(scope, session);

      try {
        const payload = {
          clinicId: scope.clinicObjectId,
          patientId: patientObjectId,
          date: scope.date,
          tokenNumber,
          status: QueueStatus.WAITING,
        };
        const entry = session
          ? (await this.queueModel.create([payload], { session }))[0]
          : await this.queueModel.create(payload);

        if (!session) {
          await entry.populate('patientId', 'name phone');
          this.queueSms(clinicId, entry, 'token');
        }
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
    const scope = await this.dayScope(clinicId);
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
    const scope = await this.dayScope(clinicId);
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

      this.queueSms(clinicId, entry, 'serving');
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
    const scope = await this.dayScope(clinicId);
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

      this.queueSms(clinicId, entry, 'serving');
      return entry;
    } finally {
      await session.endSession();
    }
  }

  async reorderWaiting(clinicId: string, orderedEntryIds: string[]) {
    const scope = await this.dayScope(clinicId);

    const waiting = await this.queueModel
      .find({
        clinicId: scope.clinicObjectId,
        date: scope.date,
        status: QueueStatus.WAITING,
      })
      .sort({ tokenNumber: 1 })
      .exec();

    const validatedIds = await this.validateReorderInput(
      scope,
      orderedEntryIds,
      waiting,
    );

    const tokenNumbers = waiting.map((e) => e.tokenNumber).sort((a, b) => a - b);
    const waitingFilter = {
      clinicId: scope.clinicObjectId,
      date: scope.date,
      status: QueueStatus.WAITING,
    };
    const session = await this.connection.startSession();

    try {
      await session.withTransaction(async () => {
        for (const entry of waiting) {
          const phase1 = await this.queueModel
            .updateOne(
              { _id: entry._id, ...waitingFilter },
              { tokenNumber: -entry.tokenNumber },
              { session, runValidators: false },
            )
            .exec();
          if (phase1.modifiedCount !== 1) {
            throw new ConflictException(
              'Queue changed during reorder; please retry',
            );
          }
        }

        for (let i = 0; i < validatedIds.length; i++) {
          const phase2 = await this.queueModel
            .updateOne(
              { _id: toObjectId(validatedIds[i]), ...waitingFilter },
              { tokenNumber: tokenNumbers[i] },
              { session, runValidators: false },
            )
            .exec();
          if (phase2.modifiedCount !== 1) {
            throw new ConflictException(
              'Queue changed during reorder; please retry',
            );
          }
        }
      });
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Unable to reorder queue due to a token conflict; please retry',
        );
      }
      throw new InternalServerErrorException('Failed to reorder queue');
    } finally {
      await session.endSession();
    }

    return this.getToday(clinicId);
  }

  private async validateReorderInput(
    scope: ReturnType<typeof resolveClinicDayScope>,
    orderedEntryIds: string[],
    waiting: QueueDocument[],
  ): Promise<string[]> {
    const seen = new Set<string>();
    for (const id of orderedEntryIds) {
      if (seen.has(id)) {
        throw new BadRequestException(
          'orderedEntryIds must not contain duplicate IDs',
        );
      }
      seen.add(id);
    }

    if (waiting.length === 0) {
      throw new BadRequestException('There are no waiting entries to reorder');
    }

    if (orderedEntryIds.length !== waiting.length) {
      throw new BadRequestException(
        'orderedEntryIds must include every waiting entry exactly once',
      );
    }

    const waitingIdSet = new Set(waiting.map((e) => e._id.toString()));
    const notWaitingIds = orderedEntryIds.filter((id) => !waitingIdSet.has(id));
    if (notWaitingIds.length === 0) {
      return orderedEntryIds;
    }

    const entries = await this.queueModel
      .find({ _id: { $in: notWaitingIds.map((id) => toObjectId(id)) } })
      .exec();
    const entryById = new Map(entries.map((e) => [e._id.toString(), e]));

    for (const id of notWaitingIds) {
      const entry = entryById.get(id);
      if (!entry) {
        throw new BadRequestException(`Queue entry ${id} not found`);
      }
      if (
        entry.clinicId.toString() !== scope.clinicObjectId.toString() ||
        entry.date.getTime() !== scope.date.getTime()
      ) {
        throw new BadRequestException(
          `Queue entry ${id} is not in today's queue for this clinic`,
        );
      }
      throw new BadRequestException(
        `Queue entry ${id} cannot be reordered (status: ${entry.status}); only waiting entries can be reordered`,
      );
    }

    return orderedEntryIds;
  }

  private async findTodayEntry(clinicId: string, entryId: string) {
    const scope = await this.dayScope(clinicId);
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
