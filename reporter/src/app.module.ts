import { Module } from '@nestjs/common'
import { PrismaModule } from '@kingo1/universe-assignment-shared'
import { ReportsModule } from './reports/reports.module'
import { APP_PIPE } from '@nestjs/core'
import { ZodValidationPipe } from 'nestjs-zod'
import { ConfigModule } from '@nestjs/config'
import { MetricsModule } from './metrics/metrics.module'
import { HealthModule } from './health/health.module'

@Module({
  // TODO: ConfigModule?
  imports: [
    PrismaModule,
    ReportsModule,
    ConfigModule.forRoot({ isGlobal: true }),
    MetricsModule,
    HealthModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
