import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { UserRole } from '../user/schemas/user.schema';
import { AppointmentService } from './appointment.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { GetAppointmentsQueryDto } from './dto/get-appointments-query.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.PLATFORM_ADMIN)
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  book(
    @CurrentUser() user: AuthenticatedUser,
    @Body() bookAppointmentDto: BookAppointmentDto,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    return this.appointmentService.book(clinicId, bookAppointmentDto);
  }

  @Get()
  findByDate(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetAppointmentsQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    return this.appointmentService.findByDate(
      clinicId,
      query.date,
      query.timeSlot,
    );
  }

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  async arrive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    const result = await this.appointmentService.arrive(clinicId, id);
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.added', {
      queueEntryId: String(result.queueEntry._id),
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    this.realtimeEmitter.emitToClinic(clinicId, 'appointment.updated', {
      appointmentId: id,
      status: 'arrived',
    });
    return result;
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    const appointment = await this.appointmentService.cancel(clinicId, id);
    this.realtimeEmitter.emitToClinic(clinicId, 'appointment.updated', {
      appointmentId: id,
      status: appointment.status,
    });
    return appointment;
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    const appointment = await this.appointmentService.confirm(clinicId, id);
    this.realtimeEmitter.emitToClinic(clinicId, 'appointment.updated', {
      appointmentId: id,
      status: appointment.status,
    });
    return appointment;
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    const appointment = await this.appointmentService.complete(clinicId, id);
    this.realtimeEmitter.emitToClinic(clinicId, 'appointment.updated', {
      appointmentId: id,
      status: appointment.status,
    });
    return appointment;
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  async noShow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() scope: ClinicScopeQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    const appointment = await this.appointmentService.markNoShow(clinicId, id);
    this.realtimeEmitter.emitToClinic(clinicId, 'appointment.updated', {
      appointmentId: id,
      status: appointment.status,
    });
    return appointment;
  }
}
