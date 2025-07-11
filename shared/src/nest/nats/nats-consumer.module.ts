import { DynamicModule, Module } from '@nestjs/common'
import { NatsConsumerService } from './nats-consumer.service'

@Module({
  providers: [NatsConsumerService],
  exports: [NatsConsumerService],
})
export class NatsConsumerModule {}
