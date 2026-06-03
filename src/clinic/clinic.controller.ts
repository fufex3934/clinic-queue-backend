import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { getClinicIdFromUser } from '../common/tenant/clinic-tenant.util';
import { UserRole } from '../user/schemas/user.schema';
import { ClinicService } from './clinic.service';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { DeleteClinicQueryDto } from './dto/delete-clinic-query.dto';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';
import { SkipSubscription } from '../payment/decorators/skip-subscription.decorator';

@Controller('clinics')
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipSubscription()
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  /** Current user's clinic (all staff). */
  @Get('me')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  getMyClinic(@CurrentUser() user: AuthenticatedUser) {
    return this.clinicService.getMyClinic(getClinicIdFromUser(user));
  }

  /** Platform operator — all tenants. */
  @Get()
  @Roles(UserRole.PLATFORM_ADMIN)
  findAll(@Query() query: ListClinicsQueryDto) {
    return this.clinicService.findAllForPlatform(query);
  }

  @Post()
  @Roles(UserRole.PLATFORM_ADMIN)
  create(@Body() createClinicDto: CreateClinicDto) {
    return this.clinicService.create(createClinicDto);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.PLATFORM_ADMIN)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicService.findOneScoped(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.PLATFORM_ADMIN)
  update(
    @Param('id') id: string,
    @Body() updateClinicDto: UpdateClinicDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.clinicService.updateScoped(id, updateClinicDto, user);
  }

  @Delete(':id')
  @Roles(UserRole.PLATFORM_ADMIN)
  remove(
    @Param('id') id: string,
    @Query() query: DeleteClinicQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (query.permanent === 'true') {
      return this.clinicService.removePermanent(id, user);
    }
    return this.clinicService.removeScoped(id, user);
  }
}
