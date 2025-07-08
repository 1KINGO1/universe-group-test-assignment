import {Module} from '@nestjs/common';
import {EventsModule} from './events/events.module';
import {ConfigModule} from '@nestjs/config';
import {NatsModule} from './nats/nats.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
	imports: [
		EventsModule,
		ConfigModule.forRoot({
			isGlobal: true
		}),
		NatsModule,
		MetricsModule
	],
	controllers: [],
	providers: [],
})
export class AppModule {
}
