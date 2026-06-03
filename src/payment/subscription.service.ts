import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toObjectId } from '../common/utils/mongo.util';
import {
  SubscriptionPlan,
} from './schemas/payment-request.schema';
import {
  Subscription,
  SubscriptionDocument,
} from './schemas/subscription.schema';

export const SUBSCRIPTION_GRACE_DAYS = 3;
export const SUBSCRIPTION_DURATION_DAYS = 30;
export const RENEWAL_WARNING_DAYS = 7;

export type RenewalStatus =
  | 'none'
  | 'active'
  | 'expiring_soon'
  | 'grace'
  | 'expired';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<SubscriptionDocument>,
  ) {}

  async findByClinicId(clinicId: string): Promise<SubscriptionDocument | null> {
    return this.subscriptionModel
      .findOne({ clinicId: toObjectId(clinicId) })
      .exec();
  }

  /** Legacy clinics created before subscriptions — grant a starter trial once. */
  async ensureStarterTrialIfMissing(
    clinicId: string,
  ): Promise<SubscriptionDocument | null> {
    const existing = await this.findByClinicId(clinicId);
    if (existing) {
      return existing;
    }
    return this.activateOrExtend(clinicId, SubscriptionPlan.STARTER);
  }

  async findAllActive(): Promise<SubscriptionDocument[]> {
    const now = new Date();
    const graceCutoff = this.addDays(now, -SUBSCRIPTION_GRACE_DAYS);
    return this.subscriptionModel
      .find({
        isActive: true,
        endDate: { $gte: graceCutoff },
      })
      .exec();
  }

  async isClinicAccessAllowed(clinicId: string): Promise<boolean> {
    const sub = await this.findByClinicId(clinicId);
    if (!sub) {
      return false;
    }
    const graceEnd = new Date(sub.endDate);
    graceEnd.setUTCDate(graceEnd.getUTCDate() + SUBSCRIPTION_GRACE_DAYS);
    return sub.isActive && new Date() <= graceEnd;
  }

  async activateOrExtend(
    clinicId: string,
    plan: SubscriptionPlan,
  ): Promise<SubscriptionDocument> {
    const clinicObjectId = toObjectId(clinicId);
    const now = new Date();
    const existing = await this.subscriptionModel
      .findOne({ clinicId: clinicObjectId })
      .exec();

    let startDate = now;
    let endDate = this.addDays(now, SUBSCRIPTION_DURATION_DAYS);

    if (existing?.endDate && existing.endDate > now) {
      startDate = existing.startDate;
      endDate = this.addDays(existing.endDate, SUBSCRIPTION_DURATION_DAYS);
    }

    return this.subscriptionModel
      .findOneAndUpdate(
        { clinicId: clinicObjectId },
        {
          clinicId: clinicObjectId,
          plan,
          startDate,
          endDate,
          isActive: true,
        },
        { upsert: true, new: true },
      )
      .exec() as Promise<SubscriptionDocument>;
  }

  getBillingStatus(sub: SubscriptionDocument | null) {
    if (!sub) {
      return {
        isActive: false,
        inGracePeriod: false,
        plan: null as SubscriptionPlan | null,
        startDate: null as string | null,
        endDate: null as string | null,
        renewDate: null as string | null,
        graceEndDate: null as string | null,
        daysUntilRenew: null as number | null,
        daysLeftInGrace: null as number | null,
        renewalStatus: 'none' as RenewalStatus,
        shouldNotifyRenewal: false,
      };
    }

    const now = new Date();
    const graceEnd = this.addDays(sub.endDate, SUBSCRIPTION_GRACE_DAYS);
    const withinSubscription = sub.isActive && now <= sub.endDate;
    const inGracePeriod =
      sub.isActive && now > sub.endDate && now <= graceEnd;
    const daysUntilRenew = this.daysBetween(now, sub.endDate);
    const daysLeftInGrace = inGracePeriod
      ? this.daysBetween(now, graceEnd)
      : null;

    let renewalStatus: RenewalStatus = 'active';
    if (!sub.isActive || now > graceEnd) {
      renewalStatus = 'expired';
    } else if (inGracePeriod) {
      renewalStatus = 'grace';
    } else if (
      daysUntilRenew >= 0 &&
      daysUntilRenew <= RENEWAL_WARNING_DAYS
    ) {
      renewalStatus = 'expiring_soon';
    }

    const shouldNotifyRenewal =
      renewalStatus === 'expiring_soon' ||
      renewalStatus === 'grace' ||
      renewalStatus === 'expired';

    return {
      isActive: withinSubscription || inGracePeriod,
      inGracePeriod,
      plan: sub.plan,
      startDate: sub.startDate.toISOString(),
      endDate: sub.endDate.toISOString(),
      renewDate: sub.endDate.toISOString(),
      graceEndDate: graceEnd.toISOString(),
      daysUntilRenew,
      daysLeftInGrace,
      renewalStatus,
      shouldNotifyRenewal,
    };
  }

  private daysBetween(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }
}
