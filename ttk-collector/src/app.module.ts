import { Module } from '@nestjs/common'
import { PrismaModule } from '@kingo1/universe-assignment-shared'
import { ConfigModule } from '@nestjs/config'
import { EventCollectorModule } from './event-collector/event-collector.module'
import { MetricsModule } from './metrics/metrics.module'
import { HealthModule } from './health/health.module'
import { LoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventCollectorModule,
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
})
export class AppModule {}
