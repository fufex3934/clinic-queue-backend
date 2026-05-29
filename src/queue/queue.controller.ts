import {
  Body,
  Controller,
  Delete,
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
import { resolveOperationalClinicId } from '../common/tenant/resolve-operational-clinic-id.util';
import { StructuredLoggerService } from '../common/observability/structured-logger.service';
import { RealtimeEmitterService } from '../realtime/realtime-emitter.service';
import { UserRole } from '../user/schemas/user.schema';
import { AddToQueueDto } from './dto/add-to-queue.dto';
import { QueueTodayQueryDto } from './dto/queue-today-query.dto';
import { ReorderQueueDto } from './dto/reorder-queue.dto';
import { QueueService } from './queue.service';

@Controller('queue')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.RECEPTIONIST, UserRole.PLATFORM_ADMIN)
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly structuredLogger: StructuredLoggerService,
    private readonly realtimeEmitter: RealtimeEmitterService,
  ) {}

  @Post('add')
  @HttpCode(HttpStatus.CREATED)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() addToQueueDto: AddToQueueDto,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
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
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.added', {
      queueEntryId: String(entry._id),
      tokenNumber: entry.tokenNumber,
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    return entry;
  }

  @Get('today')
  async getToday(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    return this.queueService.getToday(clinicId);
  }

  @Patch('serve-next')
  async serveNext(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    const entry = await this.queueService.serveNext(clinicId);
    this.structuredLogger.logQueue({
      action: 'queue.serve-next',
      userId: user.id,
      clinicId,
      meta: { tokenNumber: entry.tokenNumber, queueEntryId: String(entry._id) },
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.served', {
      queueEntryId: String(entry._id),
      tokenNumber: entry.tokenNumber,
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    return entry;
  }

  @Patch('reorder')
  @Roles(UserRole.ADMIN, UserRole.PLATFORM_ADMIN)
  async reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReorderQueueDto,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    const entries = await this.queueService.reorderWaiting(
      clinicId,
      dto.orderedEntryIds,
    );
    this.structuredLogger.logQueue({
      action: 'queue.reorder',
      userId: user.id,
      clinicId,
      meta: { count: dto.orderedEntryIds.length },
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    return entries;
  }

  @Patch(':id/skip')
  async skip(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    const entry = await this.queueService.skipEntry(clinicId, id);
    this.structuredLogger.logQueue({
      action: 'queue.skip',
      userId: user.id,
      clinicId,
      meta: { queueEntryId: id },
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    return entry;
  }

  @Patch(':id/serve')
  @Roles(UserRole.ADMIN, UserRole.PLATFORM_ADMIN)
  async forceServe(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    const entry = await this.queueService.forceServeEntry(clinicId, id);
    this.structuredLogger.logQueue({
      action: 'queue.force-serve',
      userId: user.id,
      clinicId,
      meta: { queueEntryId: id, tokenNumber: entry.tokenNumber },
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.served', {
      queueEntryId: String(entry._id),
      tokenNumber: entry.tokenNumber,
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    return entry;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query() query: QueueTodayQueryDto,
  ) {
    const clinicId = resolveOperationalClinicId(user, query.clinicId);
    const result = await this.queueService.removeEntry(clinicId, id);
    this.structuredLogger.logQueue({
      action: 'queue.remove',
      userId: user.id,
      clinicId,
      meta: { queueEntryId: id },
    });
    this.realtimeEmitter.emitToClinic(clinicId, 'queue.updated', {});
    return result;
  }
}
