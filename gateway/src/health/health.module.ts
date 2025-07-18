import { Module } from '@nestjs/common'
import { HealthService } from './health.service'
import { HealthController } from './health.controller'

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  imports: [],
})
export class HealthModule {}
