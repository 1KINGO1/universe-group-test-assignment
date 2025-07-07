import {Module} from '@nestjs/common';
import {EventsModule} from './events/events.module';
import {ConfigModule} from '@nestjs/config';
import {NatsModule} from './nats/nats.module';

@Module({
	imports: [
		EventsModule,
		ConfigModule.forRoot({
			isGlobal: true
		}),
		NatsModule
	],
	controllers: [],
	providers: [],
})
export class AppModule {
}
