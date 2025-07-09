import {Module} from '@nestjs/common';
import {EventCollectorService} from './event-collector.service';
import {NatsConsumerModule} from '@kingo1/universe-assignment-shared';
import {MetricsModule} from '../metrics/metrics.module';

@Module({
	providers: [EventCollectorService],
	imports: [NatsConsumerModule, MetricsModule]
})
export class EventCollectorModule {
}
