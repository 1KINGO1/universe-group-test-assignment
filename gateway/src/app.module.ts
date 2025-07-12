import { Module } from '@nestjs/common'
import { EventsModule } from './events/events.module'
import { ConfigModule } from '@nestjs/config'
import { PrismaModule } from '@kingo1/universe-assignment-shared'
import { MetricsModule } from './metrics/metrics.module'
import { HealthModule } from './health/health.module'
import { LoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    EventsModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
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
  controllers: [],
  providers: [],
})
export class AppModule {}
