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
import { getClinicIdFromUser } from '../common/tenant/clinic-tenant.util';
import { UserRole } from '../user/schemas/user.schema';
import { AppointmentService } from './appointment.service';
import { BookAppointmentDto } from './dto/book-appointment.dto';
import { GetAppointmentsQueryDto } from './dto/get-appointments-query.dto';

@Controller('appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Post('book')
  @HttpCode(HttpStatus.CREATED)
  book(
    @CurrentUser() user: AuthenticatedUser,
    @Body() bookAppointmentDto: BookAppointmentDto,
  ) {
    return this.appointmentService.book(
      getClinicIdFromUser(user),
      bookAppointmentDto,
    );
  }

  @Get()
  findByDate(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetAppointmentsQueryDto,
  ) {
    return this.appointmentService.findByDate(
      getClinicIdFromUser(user),
      query.date,
      query.timeSlot,
    );
  }

  @Post(':id/arrive')
  @HttpCode(HttpStatus.OK)
  arrive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.appointmentService.arrive(getClinicIdFromUser(user), id);
  }
}
