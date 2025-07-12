import { Module } from '@nestjs/common'
import { PrismaModule } from '@kingo1/universe-assignment-shared'
import { ReportsModule } from './reports/reports.module'
import { APP_PIPE } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import { ConfigModule } from '@nestjs/config'
import { MetricsModule } from './metrics/metrics.module'
import { HealthModule } from './health/health.module'
import { LoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    PrismaModule,
    ReportsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    MetricsModule,
    HealthModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  singleLine: true,
                },
              }
            : undefined,
      },
    }),
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
