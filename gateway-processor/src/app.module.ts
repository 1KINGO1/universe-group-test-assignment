import { Module } from '@nestjs/common';
import { EventProcessorModule } from './event-processor/event-processor.module';
import {ConfigModule} from '@nestjs/config';
import {NatsModule} from './nats/nats.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    EventProcessorModule, 
    ConfigModule.forRoot({isGlobal: true}), 
    NatsModule,
    MetricsModule
  ],
})
export class AppModule {}
