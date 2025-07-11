import { Module } from '@nestjs/common'
import { HealthService } from './health.service'
import { HealthController } from './health.controller'
import { NatsModule } from 'src/nats/nats.module'

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  imports: [NatsModule],
})
export class HealthModule {}
