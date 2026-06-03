import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { Clinic, ClinicDocument } from '../clinic/schemas/clinic.schema';
import { isPlatformAdmin } from '../common/tenant/clinic-tenant.util';
import { toObjectId } from '../common/utils/mongo.util';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { PaginatedResult } from '../common/interfaces/paginated-result.interface';
import {
  buildMongoSort,
  buildPaginatedResult,
  escapeRegex,
  parsePagination,
} from '../common/utils/pagination.util';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { ListPaymentsAdminQueryDto } from './dto/list-payments-admin-query.dto';
import { ListPaymentsMyQueryDto } from './dto/list-payments-my-query.dto';
import {
  PaymentRequest,
  PaymentRequestDocument,
  PaymentRequestStatus,
} from './schemas/payment-request.schema';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';
import { SubscriptionService } from './subscription.service';

const PLAN_AMOUNTS: Record<string, number> = {
  starter: 29,
  professional: 79,
  enterprise: 199,
};

type PaymentRealtimeAction =
  | 'submitted'
  | 'proof_uploaded'
  | 'approved'
  | 'rejected';

@Injectable()
export class PaymentService {
  constructor(
    @InjectModel(PaymentRequest.name)
    private readonly paymentRequestModel: Model<PaymentRequestDocument>,
    @InjectModel(Clinic.name)
    private readonly clinicModel: Model<ClinicDocument>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
    private readonly subscriptionService: SubscriptionService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  async createRequest(
    clinicId: string,
    dto: CreatePaymentRequestDto,
  ): Promise<PaymentRequestDocument> {
    const pending = await this.paymentRequestModel
      .findOne({
        clinicId: toObjectId(clinicId),
        status: PaymentRequestStatus.PENDING,
      })
      .exec();

    if (pending) {
      throw new BadRequestException(
        'A pending payment request already exists for this clinic',
      );
    }

    const amount = dto.amount > 0 ? dto.amount : PLAN_AMOUNTS[dto.plan] ?? 0;

    const [doc] = await this.paymentRequestModel.create([
      {
        clinicId: toObjectId(clinicId),
        plan: dto.plan,
        amount,
        status: PaymentRequestStatus.PENDING,
      },
    ]);

    await this.emitPaymentUpdated(doc, 'submitted');
    return doc;
  }

  async uploadProof(
    clinicId: string,
    requestId: string,
    proofImage: string,
  ): Promise<PaymentRequestDocument> {
    const request = await this.findClinicRequest(clinicId, requestId);
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests accept proof uploads');
    }
    request.proofImage = proofImage;
    await request.save();
    await this.emitPaymentUpdated(request, 'proof_uploaded');
    return request;
  }

  async listMy(
    clinicId: string,
    query: ListPaymentsMyQueryDto,
  ): Promise<PaginatedResult<PaymentRequestDocument>> {
    const { page, limit, skip } = parsePagination(query);
    const filter = { clinicId: toObjectId(clinicId) };
    const sort = buildMongoSort(
      query.sortBy,
      query.sortOrder,
      { createdAt: 'createdAt', amount: 'amount', status: 'status' },
      'createdAt',
    );
    const [items, total] = await Promise.all([
      this.paymentRequestModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .exec(),
      this.paymentRequestModel.countDocuments(filter).exec(),
    ]);
    return buildPaginatedResult(items, total, page, limit);
  }

  async listAdmin(query: ListPaymentsAdminQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.clinicId) {
      filter.clinicId = toObjectId(query.clinicId);
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.plan) {
      filter.plan = query.plan;
    }
    if (query.search?.trim()) {
      const escaped = escapeRegex(query.search.trim());
      const clinics = await this.clinicModel
        .find({
          $or: [
            { name: { $regex: escaped, $options: 'i' } },
            { location: { $regex: escaped, $options: 'i' } },
          ],
        })
        .select('_id')
        .lean()
        .exec();
      const clinicIds = clinics.map((c) => c._id);
      if (clinicIds.length === 0) {
        return buildPaginatedResult([], 0, page, limit);
      }
      filter.clinicId = { $in: clinicIds };
    }
    const sort = buildMongoSort(
      query.sortBy,
      query.sortOrder,
      {
        createdAt: 'createdAt',
        amount: 'amount',
        plan: 'plan',
        status: 'status',
      },
      'createdAt',
    );
    const [items, total] = await Promise.all([
      this.paymentRequestModel
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('clinicId', 'name location')
        .exec(),
      this.paymentRequestModel.countDocuments(filter).exec(),
    ]);
    return buildPaginatedResult(items, total, page, limit);
  }

  async approve(
    requestId: string,
    user: AuthenticatedUser,
  ): Promise<PaymentRequestDocument> {
    if (!isPlatformAdmin(user)) {
      throw new BadRequestException('Only platform administrators can approve');
    }

    const request = await this.paymentRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException(`Payment request ${requestId} not found`);
    }
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be approved');
    }

    request.status = PaymentRequestStatus.APPROVED;
    request.approvedAt = new Date();
    await request.save();

    await this.subscriptionService.activateOrExtend(
      request.clinicId.toString(),
      request.plan,
    );

    await this.emitPaymentUpdated(request, 'approved');
    return request;
  }

  async reject(
    requestId: string,
    user: AuthenticatedUser,
  ): Promise<PaymentRequestDocument> {
    if (!isPlatformAdmin(user)) {
      throw new BadRequestException('Only platform administrators can reject');
    }

    const request = await this.paymentRequestModel.findById(requestId).exec();
    if (!request) {
      throw new NotFoundException(`Payment request ${requestId} not found`);
    }
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests can be rejected');
    }

    request.status = PaymentRequestStatus.REJECTED;
    await request.save();
    await this.emitPaymentUpdated(request, 'rejected');
    return request;
  }

  async getRevenueMetrics() {
    const [approved, activeSubs] = await Promise.all([
      this.paymentRequestModel
        .find({ status: PaymentRequestStatus.APPROVED })
        .sort({ approvedAt: 1 })
        .exec(),
      this.subscriptionService.findAllActive(),
    ]);

    const planMrr: Record<string, number> = {
      starter: 29,
      professional: 79,
      enterprise: 199,
    };

    let mrr = 0;
    for (const sub of activeSubs) {
      mrr += planMrr[sub.plan] ?? 0;
    }

    const byMonth = new Map<string, number>();
    let totalRevenue = 0;

    for (const payment of approved) {
      totalRevenue += payment.amount;
      const date =
        payment.approvedAt ??
        (payment as PaymentRequestDocument & { createdAt?: Date }).createdAt;
      if (!date) continue;
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + payment.amount);
    }

    const revenueByMonth = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({ month, amount }));

    return {
      mrr,
      totalRevenue,
      activeSubscriptions: activeSubs.length,
      approvedPayments: approved.length,
      revenueByMonth,
    };
  }

  async uploadProofFile(
    clinicId: string,
    requestId: string,
    proofUrl: string,
  ): Promise<PaymentRequestDocument> {
    const request = await this.findClinicRequest(clinicId, requestId);
    if (request.status !== PaymentRequestStatus.PENDING) {
      throw new BadRequestException('Only pending requests accept proof uploads');
    }
    request.proofImage = proofUrl;
    await request.save();
    await this.emitPaymentUpdated(request, 'proof_uploaded');
    return request;
  }

  async getBillingSummary(clinicId: string) {
    const clinicObjectId = toObjectId(clinicId);
    const subscription =
      await this.subscriptionService.ensureStarterTrialIfMissing(clinicId);
    const billing = this.subscriptionService.getBillingStatus(subscription);
    const [latestRequest, timelineRows, lastApproved] = await Promise.all([
      this.paymentRequestModel
        .findOne({ clinicId: clinicObjectId })
        .sort({ createdAt: -1 })
        .exec(),
      this.paymentRequestModel
        .find({
          clinicId: clinicObjectId,
          status: PaymentRequestStatus.APPROVED,
        })
        .sort({ approvedAt: -1 })
        .limit(24)
        .select('plan amount approvedAt createdAt')
        .lean()
        .exec(),
      this.paymentRequestModel
        .findOne({
          clinicId: clinicObjectId,
          status: PaymentRequestStatus.APPROVED,
        })
        .sort({ approvedAt: -1 })
        .select('plan amount approvedAt')
        .lean()
        .exec(),
    ]);

    const timeline = timelineRows.map((row) => ({
      id: row._id.toString(),
      plan: row.plan,
      amount: row.amount,
      paidAt: row.approvedAt?.toISOString() ?? null,
    }));

    return {
      subscription: billing,
      latestPayment: latestRequest
        ? {
            id: latestRequest._id.toString(),
            plan: latestRequest.plan,
            amount: latestRequest.amount,
            status: latestRequest.status,
            createdAt: (latestRequest as PaymentRequestDocument & { createdAt?: Date })
              .createdAt,
          }
        : null,
      lastPaid: lastApproved
        ? {
            plan: lastApproved.plan,
            amount: lastApproved.amount,
            paidAt: lastApproved.approvedAt?.toISOString() ?? null,
          }
        : null,
      timeline,
      renewalAlert: this.buildRenewalAlert(billing),
    };
  }

  async listSubscriptionOverview(query: ListSubscriptionsQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const filter: Record<string, unknown> = {};
    if (query.search?.trim()) {
      const escaped = escapeRegex(query.search.trim());
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { location: { $regex: escaped, $options: 'i' } },
      ];
    }

    const sortField =
      query.sortBy === 'renewDate'
        ? 'endDate'
        : query.sortBy === 'lastPaidAt'
          ? 'lastPaidAt'
          : query.sortBy === 'createdAt'
            ? 'createdAt'
            : 'name';

    const clinics = await this.clinicModel
      .find(filter)
      .sort({ name: 1 })
      .exec();

    if (clinics.length === 0) {
      return buildPaginatedResult([], 0, page, limit);
    }

    const clinicIds = clinics.map((c) => c._id);

    const [subscriptions, lastPaidAgg] = await Promise.all([
      this.subscriptionModel
        .find({ clinicId: { $in: clinicIds } })
        .exec(),
      this.paymentRequestModel
        .aggregate<{
          _id: Types.ObjectId;
          plan: string;
          amount: number;
          approvedAt: Date;
        }>([
          {
            $match: {
              clinicId: { $in: clinicIds },
              status: PaymentRequestStatus.APPROVED,
            },
          },
          { $sort: { approvedAt: -1 } },
          {
            $group: {
              _id: '$clinicId',
              plan: { $first: '$plan' },
              amount: { $first: '$amount' },
              approvedAt: { $first: '$approvedAt' },
            },
          },
        ])
        .exec(),
    ]);

    const subByClinic = new Map(
      subscriptions.map((s) => [s.clinicId.toString(), s]),
    );
    const paidByClinic = new Map(
      lastPaidAgg.map((p) => [p._id.toString(), p]),
    );

    let items = clinics.map((clinic) => {
      const id = clinic._id.toString();
      const sub = subByClinic.get(id) ?? null;
      const billing = this.subscriptionService.getBillingStatus(sub);
      const lastPaid = paidByClinic.get(id);
      return {
        clinicId: id,
        clinicName: clinic.name,
        location: clinic.location,
        clinicIsActive: clinic.isActive !== false,
        ...billing,
        lastPaid: lastPaid
          ? {
              plan: lastPaid.plan,
              amount: lastPaid.amount,
              paidAt: lastPaid.approvedAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    if (query.renewalStatus) {
      items = items.filter((row) => row.renewalStatus === query.renewalStatus);
    }

    const order = query.sortOrder === 'desc' ? -1 : 1;
    items.sort((a, b) => {
      if (sortField === 'name') {
        return order * a.clinicName.localeCompare(b.clinicName);
      }
      if (sortField === 'endDate') {
        const aDate = a.renewDate ? new Date(a.renewDate).getTime() : 0;
        const bDate = b.renewDate ? new Date(b.renewDate).getTime() : 0;
        return order * (aDate - bDate);
      }
      if (sortField === 'lastPaidAt') {
        const aDate = a.lastPaid?.paidAt
          ? new Date(a.lastPaid.paidAt).getTime()
          : 0;
        const bDate = b.lastPaid?.paidAt
          ? new Date(b.lastPaid.paidAt).getTime()
          : 0;
        return order * (aDate - bDate);
      }
      return order * a.clinicName.localeCompare(b.clinicName);
    });

    const total = items.length;
    const paged = items.slice(skip, skip + limit);
    return buildPaginatedResult(paged, total, page, limit);
  }

  private buildRenewalAlert(billing: ReturnType<SubscriptionService['getBillingStatus']>) {
    if (!billing.shouldNotifyRenewal) {
      return null;
    }
    const renewLabel = billing.renewDate
      ? new Date(billing.renewDate).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'soon';

    if (billing.renewalStatus === 'expired') {
      return {
        level: 'error' as const,
        title: 'Subscription expired',
        message: `Your subscription ended. Submit a renewal payment to restore access.`,
        renewDate: billing.renewDate,
      };
    }
    if (billing.renewalStatus === 'grace') {
      return {
        level: 'warning' as const,
        title: 'Grace period',
        message: `Subscription ended ${renewLabel}. You have ${billing.daysLeftInGrace ?? 0} day(s) left before access is blocked.`,
        renewDate: billing.renewDate,
      };
    }
    return {
      level: 'info' as const,
      title: 'Renewal due soon',
      message: `Next term payment is due by ${renewLabel} (${billing.daysUntilRenew} day(s) remaining).`,
      renewDate: billing.renewDate,
    };
  }

  private async emitPaymentUpdated(
    request: PaymentRequestDocument,
    action: PaymentRealtimeAction,
  ): Promise<void> {
    const clinicId = request.clinicId.toString();
    const clinic = await this.clinicModel
      .findById(clinicId)
      .select('name')
      .lean()
      .exec();
    const payload = {
      action,
      clinicId,
      clinicName: clinic?.name ?? 'Clinic',
      plan: request.plan,
      amount: request.amount,
      requestId: request._id.toString(),
    };

    this.realtimeEmitter.emitToClinic(clinicId, 'payment.updated', payload);
    this.realtimeEmitter.emitToPlatform('payment.updated', payload);
  }

  private async findClinicRequest(clinicId: string, requestId: string) {
    const request = await this.paymentRequestModel
      .findOne({
        _id: toObjectId(requestId),
        clinicId: toObjectId(clinicId),
      })
      .exec();
    if (!request) {
      throw new NotFoundException(`Payment request ${requestId} not found`);
    }
    return request;
  }
}
