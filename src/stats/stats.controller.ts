import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  getClinicIdFromUser,
  isPlatformAdmin,
} from '../common/tenant/clinic-tenant.util';
import { UserRole } from '../user/schemas/user.schema';
import { StatsService } from './stats.service';

@Controller('stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.PLATFORM_ADMIN)
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: AuthenticatedUser) {
    if (isPlatformAdmin(user)) {
      return this.statsService.getPlatformDashboard();
    }
    return this.statsService.getClinicDashboard(getClinicIdFromUser(user));
  }
}
