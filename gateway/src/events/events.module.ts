import { Module } from '@nestjs/common'
import { EventsService } from './events.service'
import { EventsController } from './events.controller'
import { MetricsModule } from 'src/metrics/metrics.module'

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  imports: [MetricsModule],
})
export class EventsModule {}
