import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SkipSubscription } from './decorators/skip-subscription.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { StorageService } from '../common/storage/storage.service';
import { ClinicScopeQueryDto } from '../common/dto/clinic-scope-query.dto';
import { getClinicIdFromUser } from '../common/tenant/clinic-tenant.util';
import { resolveOperationalClinicId } from '../common/tenant/resolve-operational-clinic-id.util';
import { UserRole } from '../user/schemas/user.schema';
import { CreatePaymentRequestDto } from './dto/create-payment-request.dto';
import { ListPaymentsAdminQueryDto } from './dto/list-payments-admin-query.dto';
import { ListPaymentsMyQueryDto } from './dto/list-payments-my-query.dto';
import { ListSubscriptionsQueryDto } from './dto/list-subscriptions-query.dto';
import { UpdatePlatformPaymentSettingsDto } from './dto/update-platform-payment-settings.dto';
import { PlatformPaymentSettingsService } from './platform-payment-settings.service';
import { PaymentService } from './payment.service';

const proofUpload = memoryStorage();
const qrUpload = memoryStorage();

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@SkipSubscription()
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly storageService: StorageService,
    private readonly platformPaymentSettingsService: PlatformPaymentSettingsService,
  ) {}

  @Post('request')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  createRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentRequestDto,
  ) {
    return this.paymentService.createRequest(getClinicIdFromUser(user), dto);
  }

  @Post('upload-proof')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: proofUpload,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadProofFile(
    @CurrentUser() user: AuthenticatedUser,
    @Query('requestId') requestId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('proofImage') proofImage?: string,
  ) {
    if (!requestId?.trim()) {
      throw new BadRequestException('requestId query is required');
    }

    const clinicId = getClinicIdFromUser(user);

    if (file) {
      const proofUrl = await this.storageService.savePaymentProof(
        clinicId,
        requestId.trim(),
        file,
      );
      return this.paymentService.uploadProofFile(
        clinicId,
        requestId.trim(),
        proofUrl,
      );
    }

    if (proofImage?.trim()) {
      return this.paymentService.uploadProof(
        clinicId,
        requestId.trim(),
        proofImage.trim(),
      );
    }

    throw new BadRequestException('Provide a file or proofImage in the body');
  }

  @Get('my')
  @Roles(UserRole.ADMIN)
  listMy(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListPaymentsMyQueryDto,
  ) {
    return this.paymentService.listMy(getClinicIdFromUser(user), query);
  }

  @Get('billing')
  @Roles(UserRole.ADMIN, UserRole.RECEPTIONIST)
  billing(@CurrentUser() user: AuthenticatedUser) {
    return this.paymentService.getBillingSummary(getClinicIdFromUser(user));
  }

  @Get('payment-config')
  @Roles(UserRole.ADMIN)
  paymentConfig() {
    return this.platformPaymentSettingsService.getConfig();
  }

  @Get('admin/payment-settings')
  @Roles(UserRole.PLATFORM_ADMIN)
  adminPaymentSettings() {
    return this.platformPaymentSettingsService.getConfig();
  }

  @Patch('admin/payment-settings')
  @Roles(UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  updateAdminPaymentSettings(
    @Body() dto: UpdatePlatformPaymentSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.platformPaymentSettingsService.updateInstructions(dto, user);
  }

  @Post('admin/payment-settings/qr')
  @Roles(UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: qrUpload,
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadAdminPaymentQr(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const paymentQrImageUrl =
      await this.storageService.savePlatformPaymentQr(file);
    return this.platformPaymentSettingsService.updateQrImageUrl(
      paymentQrImageUrl,
      user,
    );
  }

  @Get('admin')
  @Roles(UserRole.PLATFORM_ADMIN)
  listAdmin(@Query() query: ListPaymentsAdminQueryDto) {
    return this.paymentService.listAdmin(query);
  }

  @Get('admin/revenue')
  @Roles(UserRole.PLATFORM_ADMIN)
  revenue() {
    return this.paymentService.getRevenueMetrics();
  }

  @Get('admin/subscriptions')
  @Roles(UserRole.PLATFORM_ADMIN)
  listSubscriptions(@Query() query: ListSubscriptionsQueryDto) {
    return this.paymentService.listSubscriptionOverview(query);
  }

  @Patch(':id/approve')
  @Roles(UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.paymentService.approve(id, user);
  }

  @Patch(':id/reject')
  @Roles(UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.OK)
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.paymentService.reject(id, user);
  }

  @Get('admin/billing')
  @Roles(UserRole.PLATFORM_ADMIN)
  adminBilling(
    @Query() scope: ClinicScopeQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const clinicId = resolveOperationalClinicId(user, scope.clinicId);
    return this.paymentService.getBillingSummary(clinicId);
  }
}
