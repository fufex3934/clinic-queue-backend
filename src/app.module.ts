import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { AppointmentModule } from './appointment/appointment.module';
import { BootstrapModule } from './common/bootstrap/bootstrap.module';
import { ClinicModule } from './clinic/clinic.module';
import { ErrorLoggingInterceptor } from './common/observability/error-logging.interceptor';
import { ObservabilityModule } from './common/observability/observability.module';
import { RequestLoggingMiddleware } from './common/observability/request-logging.middleware';
import configuration from './config/configuration';
import { validateEnvironment } from './config/validate-env';
import { HealthModule } from './health/health.module';
import { PatientModule } from './patient/patient.module';
import { QueueModule } from './queue/queue.module';
import { StatsModule } from './stats/stats.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
      validate: (config: Record<string, unknown>) => {
        validateEnvironment({ ...process.env, ...config });
        return config;
      },
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
      }),
    }),
    ObservabilityModule,
    BootstrapModule,
    HealthModule,
    AuthModule,
    UserModule,
    ClinicModule,
    PatientModule,
    AppointmentModule,
    QueueModule,
    StatsModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: ErrorLoggingInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestLoggingMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
