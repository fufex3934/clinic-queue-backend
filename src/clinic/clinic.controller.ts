import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Controller('clinics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClinicController {
  constructor(private readonly clinicService: ClinicService) {}

  /** Current user's clinic (all staff). */
  @Get('me')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.PLATFORM_ADMIN)
  getMyClinic(@CurrentUser() user: AuthenticatedUser) {
    return this.clinicService.getMyClinic(getClinicIdFromUser(user));
  }

  /** Platform operator — all tenants. */
  @Get()
  @Roles(UserRole.PLATFORM_ADMIN)
  findAll() {
    return this.clinicService.findAllForPlatform();
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
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicService.removeScoped(id, user);
  }
}
