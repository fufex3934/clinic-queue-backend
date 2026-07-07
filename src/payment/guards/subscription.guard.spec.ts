import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { UserRole } from '../../user/schemas/user.schema';
import { SubscriptionService } from '../subscription.service';
import { SubscriptionGuard } from './subscription.guard';

describe('SubscriptionGuard (C1)', () => {
  let guard: SubscriptionGuard;
  const subscriptionService = {
    ensureClinicCanOperate: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  };

  const staffUser: AuthenticatedUser = {
    id: 'user-1',
    name: 'Receptionist',
    role: UserRole.RECEPTIONIST,
    clinicId: 'clinic-1',
  };

  function buildContext(user?: AuthenticatedUser): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionGuard,
        { provide: Reflector, useValue: reflector },
        { provide: SubscriptionService, useValue: subscriptionService },
      ],
    }).compile();

    guard = module.get(SubscriptionGuard);
  });

  it('allows access when ensureClinicCanOperate permits the clinic', async () => {
    subscriptionService.ensureClinicCanOperate.mockResolvedValue({
      allowed: true,
      subscription: { plan: 'starter' },
    });

    await expect(guard.canActivate(buildContext(staffUser))).resolves.toBe(true);
    expect(subscriptionService.ensureClinicCanOperate).toHaveBeenCalledWith(
      'clinic-1',
    );
  });

  it('blocks access when ensureClinicCanOperate denies the clinic', async () => {
    subscriptionService.ensureClinicCanOperate.mockResolvedValue({
      allowed: false,
      subscription: { plan: 'starter' },
    });

    await expect(guard.canActivate(buildContext(staffUser))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
