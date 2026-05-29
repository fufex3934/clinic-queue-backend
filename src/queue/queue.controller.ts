import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { StructuredLoggerService } from '../common/observability/structured-logger.service';
import { UserRole } from '../user/schemas/user.schema';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import { QueueService } from './queue.service';

@Controller('queue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly structuredLogger: StructuredLoggerService,
  ) {}

  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() addToQueueDto: AddToQueueDto,
  ) {
    const clinicId = getClinicIdFromUser(user);
    const entry = await this.queueService.add(clinicId, addToQueueDto);
    this.structuredLogger.logQueue({
      action: 'queue.add',
      userId: user.id,
      clinicId,
      meta: {
        patientId: addToQueueDto.patientId,
        tokenNumber: entry.tokenNumber,
      },
    });
    return entry;
  }

  @Get('today')
  async getToday(@CurrentUser() user: AuthenticatedUser) {
    const clinicId = getClinicIdFromUser(user);
    const entries = await this.queueService.getToday(clinicId);
    this.structuredLogger.logQueue({
      action: 'queue.get-today',
      userId: user.id,
      clinicId,
      meta: { count: entries.length },
    });
    return entries;
  }

  @Patch('serve-next')
  async serveNext(@CurrentUser() user: AuthenticatedUser) {
    const clinicId = getClinicIdFromUser(user);
    const entry = await this.queueService.serveNext(clinicId);
    this.structuredLogger.logQueue({
      action: 'queue.serve-next',
      userId: user.id,
      clinicId,
      meta: { tokenNumber: entry.tokenNumber, queueEntryId: String(entry._id) },
    });
    return entry;
  }
}
