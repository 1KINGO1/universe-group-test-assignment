import {Module} from '@nestjs/common';
import {PrismaModule} from '@kingo1/universe-assignment-shared';
import {ConfigModule} from '@nestjs/config';
import { EventCollectorModule } from './event-collector/event-collector.module';
import {MetricsModule} from './metrics/metrics.module';
import { HealthModule } from './health/health.module';

@Module({
	imports: [
		PrismaModule,
		ConfigModule.forRoot({
			isGlobal: true
		}),
		EventCollectorModule,
		MetricsModule,
		HealthModule
	],
})
export class AppModule {
}
