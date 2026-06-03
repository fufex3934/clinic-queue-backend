import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { isPlatformAdmin } from '../../common/tenant/clinic-tenant.util';
import { UserRole } from '../../user/schemas/user.schema';
import { SKIP_SUBSCRIPTION_KEY } from '../decorators/skip-subscription.decorator';
import { SubscriptionService } from '../subscription.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      return true;
    }

    if (user.role === UserRole.PLATFORM_ADMIN) {
      return true;
    }

    const allowed = await this.subscriptionService.isClinicAccessAllowed(
      user.clinicId,
    );
    if (!allowed) {
      throw new ForbiddenException(
        'Clinic subscription is inactive. Please renew your plan in Billing.',
      );
    }

    return true;
  }
}
