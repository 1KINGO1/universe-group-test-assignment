import {Injectable, OnModuleInit} from '@nestjs/common';
import {PrismaService, NatsConsumerService, FacebookEvent} from '@kingo1/universe-assignment-shared';
import {Gender} from '@prisma/client';
import {MetricsService} from '../metrics/metrics.service';

@Injectable()
export class EventCollectorService implements OnModuleInit{
	constructor(
		private readonly natsService: NatsConsumerService,
		private readonly prismaService: PrismaService,
		private readonly metricsService: MetricsService
	) {}

	async onModuleInit() {
		this.natsService.subscribe(async data => {
			const event = data as FacebookEvent;

			try {
				const userId = `${event.source}:${event.data.user.userId}`;

				const userPayload = {
					id: userId,
					userId: event.data.user.userId,
					source: event.source,
					name: event.data.user.name,
					age: event.data.user.age,
					gender: event.data.user.gender === 'non-binary' ? 'non_binary' : event.data.user.gender as Gender,
					city: event.data.user.location.city,
					country: event.data.user.location.country,
				};

				const eventPayload = {
					eventId: event.eventId,
					source: event.source,
					eventType: event.eventType,
					funnelStage: event.funnelStage,
					timestamp: new Date(event.timestamp),
					data: event.data.engagement,
					userId,
				};

				const logPayload = {
					eventId: event.eventId,
					service: `${event.source}_collector`,
					status: "processed",
				};

				await this.prismaService.$transaction([
					this.prismaService.user.upsert({
						where: { id: userId },
						update: userPayload,
						create: userPayload,
					}),
					this.prismaService.event.create({
						data: eventPayload as never,
					}),
					this.prismaService.eventLog.create({
						data: logPayload,
					}),
				]);
				this.metricsService.acceptedEventsCounter.inc();
			} catch (err) {
				this.metricsService.failedEventsCounter.inc();
				console.log('Catched error:', err);
				await this.prismaService.eventLog.create({
					data: {
						eventId: event.eventId,
						service: `${event.source}_collector`,
						status: "failed",
					},
				});
				throw err;
			}
			finally {
				this.metricsService.processedEventsCounter.inc();
			}
		})
	}
}
