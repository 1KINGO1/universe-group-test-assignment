import { Module } from '@nestjs/common'
import { HealthService } from './health.service'
import { HealthController } from './health.controller'
import { NatsConsumerModule } from '@kingo1/universe-assignment-shared'

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  imports: [NatsConsumerModule],
})
export class HealthModule {}
