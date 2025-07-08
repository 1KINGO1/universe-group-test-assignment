import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import {NatsModule} from '../nats/nats.module';
import {MetricsModule} from '../metrics/metrics.module';

@Module({
  controllers: [EventsController],
  providers: [EventsService],
  imports: [NatsModule, MetricsModule]
})
export class EventsModule {}
