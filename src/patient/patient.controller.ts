import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ClinicScopeQueryDto } from '../common/dto/clinic-scope-query.dto';
import { resolveOperationalClinicId } from '../common/tenant/resolve-operational-clinic-id.util';
import { SubscriptionGuard } from '../payment/guards/subscription.guard';
import { UserRole } from '../user/schemas/user.schema';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { PatientService } from './patient.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createPatientDto: CreatePatientDto,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    return this.patientService.create(clinicId, createPatientDto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPatientsQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    return this.patientService.findAll(clinicId, query);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    return this.patientService.findOne(clinicId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    return this.patientService.update(clinicId, id, updatePatientDto);
  }
}
