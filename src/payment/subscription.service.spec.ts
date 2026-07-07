import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { SubscriptionPlan } from './schemas/payment-request.schema';
import { Subscription } from './schemas/subscription.schema';
import {
  SUBSCRIPTION_GRACE_DAYS,
  SubscriptionService,
} from './subscription.service';

const clinicId = new Types.ObjectId().toString();

describe('SubscriptionService.ensureClinicCanOperate (C1)', () => {
  let service: SubscriptionService;
  let findOneExec: jest.Mock;
  let findOneAndUpdateExec: jest.Mock;

  beforeEach(async () => {
    findOneExec = jest.fn();
    findOneAndUpdateExec = jest.fn();
    const subscriptionModel = {
      findOne: jest.fn().mockReturnValue({ exec: findOneExec }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: findOneAndUpdateExec }),
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: getModelToken(Subscription.name),
          useValue: subscriptionModel,
        },
      ],
    }).compile();

    service = module.get(SubscriptionService);
  });

  function subscriptionDoc(endDateOffsetDays: number) {
    const now = new Date();
    const endDate = new Date(now);
    endDate.setUTCDate(endDate.getUTCDate() + endDateOffsetDays);
    return {
      clinicId: new Types.ObjectId(clinicId),
      plan: SubscriptionPlan.STARTER,
      startDate: now,
      endDate,
      isActive: true,
    };
  }

  it('provisions starter trial and allows access when subscription is missing', async () => {
    const provisioned = subscriptionDoc(30);
    findOneExec
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    findOneAndUpdateExec.mockResolvedValue(provisioned);

    const result = await service.ensureClinicCanOperate(clinicId);

    expect(result.allowed).toBe(true);
    expect(result.subscription).toBe(provisioned);
    expect(findOneAndUpdateExec).toHaveBeenCalledTimes(1);
  });

  it('returns existing active subscription without modifying it', async () => {
    const existing = subscriptionDoc(20);
    findOneExec.mockResolvedValue(existing);

    const result = await service.ensureClinicCanOperate(clinicId);

    expect(result.allowed).toBe(true);
    expect(result.subscription).toBe(existing);
    expect(findOneExec).toHaveBeenCalledTimes(1);
    expect(findOneAndUpdateExec).not.toHaveBeenCalled();
  });

  it('blocks access when subscription is past grace period', async () => {
    const expired = subscriptionDoc(-(SUBSCRIPTION_GRACE_DAYS + 2));
    findOneExec.mockResolvedValue(expired);

    const result = await service.ensureClinicCanOperate(clinicId);

    expect(result.allowed).toBe(false);
    expect(result.subscription).toBe(expired);
    expect(findOneAndUpdateExec).not.toHaveBeenCalled();
  });
});
