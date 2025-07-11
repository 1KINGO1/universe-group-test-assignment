import { Module } from '@nestjs/common'
import { EventProcessorModule } from './event-processor/event-processor.module'
import { ConfigModule } from '@nestjs/config'
import { NatsModule } from './nats/nats.module'
import { MetricsModule } from './metrics/metrics.module'
import { HealthModule } from './health/health.module'
import { LoggerModule } from 'nestjs-pino'

@Module({
  imports: [
    EventProcessorModule,
    ConfigModule.forRoot({ isGlobal: true }),
    NatsModule,
    MetricsModule,
    HealthModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL || 'info',
        transport: process.env.NODE_ENV !== 'production'
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
