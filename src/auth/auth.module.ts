import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { NextFunction, Request, Response } from 'express';
import { createRateLimitMiddleware } from '../common/middleware/rate-limit.middleware';
import { Clinic, ClinicSchema } from '../clinic/schemas/clinic.schema';
import {
  PasswordResetToken,
  PasswordResetTokenSchema,
} from './schemas/password-reset-token.schema';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

const ONE_MINUTE_MS = 60_000;

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
}

function identifierRateLimit(prefix: string, maxRequests: number) {
  const limiter = createRateLimitMiddleware({
    maxRequests,
    windowMs: ONE_MINUTE_MS,
    keyGenerator: (req) => {
      const identifier = normalizeIdentifier(req.body?.identifier);
      return `${prefix}:id:${identifier ?? ''}`;
    },
  });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!normalizeIdentifier(req.body?.identifier)) {
      next();
      return;
    }
    limiter(req, res, next);
  };
}

@Module({
  imports: [
    UserModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn =
          configService.get<string>('jwt.expiresIn') ?? '7d';
        return {
          secret: configService.get<string>('jwt.secret'),
          signOptions: { expiresIn: expiresIn as `${number}d` },
        };
      },
    }),
    MongooseModule.forFeature([
      { name: Clinic.name, schema: ClinicSchema },
      { name: PasswordResetToken.name, schema: PasswordResetTokenSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        createRateLimitMiddleware({
          maxRequests: 10,
          windowMs: ONE_MINUTE_MS,
          keyGenerator: (req) => `auth:login:ip:${clientIp(req)}`,
        }),
        identifierRateLimit('auth:login', 10),
      )
      .forRoutes({ path: 'auth/login', method: RequestMethod.POST });

    consumer
      .apply(
        createRateLimitMiddleware({
          maxRequests: 5,
          windowMs: ONE_MINUTE_MS,
          keyGenerator: (req) => `auth:forgot-password:ip:${clientIp(req)}`,
        }),
        identifierRateLimit('auth:forgot-password', 5),
      )
      .forRoutes({ path: 'auth/forgot-password', method: RequestMethod.POST });
  }
}
