import {Module} from '@nestjs/common';
import {EventCollectorService} from './event-collector.service';
import {NatsConsumerModule} from '@kingo1/universe-assignment-shared';

@Module({
	providers: [EventCollectorService],
	imports: [NatsConsumerModule]
})
export class EventCollectorModule {
}
