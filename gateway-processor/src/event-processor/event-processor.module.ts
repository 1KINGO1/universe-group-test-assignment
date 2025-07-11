import { Module } from '@nestjs/common'
import { EventProcessorService } from './event-processor.service'
import { NatsModule } from 'src/nats/nats.module'
import { PrismaModule } from '@kingo1/universe-assignment-shared'
import { MetricsModule } from '../metrics/metrics.module'

@Module({
  providers: [EventProcessorService],
  imports: [NatsModule, PrismaModule, MetricsModule],
})
export class EventProcessorModule {}
