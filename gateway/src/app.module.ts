import {Module} from '@nestjs/common';
import {EventsModule} from './events/events.module';
import {ConfigModule} from '@nestjs/config';
import {PrismaModule} from '@kingo1/universe-assignment-shared';
import { MetricsModule } from './metrics/metrics.module';

@Module({
	imports: [
		EventsModule,
		ConfigModule.forRoot({
			isGlobal: true
		}),
		PrismaModule,
		MetricsModule
	],
	controllers: [],
	providers: [],
})
export class AppModule {
}
