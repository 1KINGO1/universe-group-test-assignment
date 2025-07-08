import { Module } from '@nestjs/common';
import { EventCollectorService } from './event-collector.service';
import {NatsModule} from '../nats/nats.module';

@Module({
  providers: [EventCollectorService],
  imports: [NatsModule]
})
export class EventCollectorModule {}
