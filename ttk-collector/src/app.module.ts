import {Module} from '@nestjs/common';
import {PrismaModule} from '@kingo1/universe-assignment-shared';
import {ConfigModule} from '@nestjs/config';
import { EventCollectorModule } from './event-collector/event-collector.module';

@Module({
	imports: [
		PrismaModule,
		ConfigModule.forRoot({
			isGlobal: true
		}),
		EventCollectorModule
	],
})
export class AppModule {
}
