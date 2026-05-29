import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreatePatientDto } from './dto/create-patient.dto';
import { PatientService } from './patient.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createPatientDto: CreatePatientDto,
  ) {
    return this.patientService.create(
      getClinicIdFromUser(user),
      createPatientDto,
    );
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.patientService.findAll(getClinicIdFromUser(user));
  }
}
