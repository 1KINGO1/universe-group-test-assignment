import {Module} from '@nestjs/common';
import {PrismaModule} from '@kingo1/universe-assignment-shared';
import {ConfigModule} from '@nestjs/config';
import {NatsModule} from './nats/nats.module';
import { EventCollectorModule } from './event-collector/event-collector.module';

@Module({
	imports: [
		PrismaModule,
		ConfigModule.forRoot({
			isGlobal: true
		}),
		NatsModule,
		EventCollectorModule
	],
})
export class AppModule {
}
