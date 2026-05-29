import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from './decorators/roles.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthenticatedUser } from './interfaces/authenticated-user.interface';
import { UserRole } from '../user/schemas/user.schema';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.PLATFORM_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  register(
    @CurrentUser() user: AuthenticatedUser,
    @Body() registerDto: RegisterDto,
  ) {
    return this.authService.register(registerDto, user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getProfile(user);
  }
}
