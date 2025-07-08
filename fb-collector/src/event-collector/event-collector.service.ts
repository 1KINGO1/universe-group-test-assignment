import {Injectable, OnModuleInit} from '@nestjs/common';
import {NatsService} from '../nats/nats.service';
import {PrismaService} from '@kingo1/universe-assignment-shared';
import {Gender} from '@prisma/client';

@Injectable()
export class EventCollectorService implements OnModuleInit{
	constructor(
		private readonly natsService: NatsService,
		private readonly prismaService: PrismaService
	) {}

	async onModuleInit() {
		this.natsService.subscribe(async data => {
			try {
				const userId = `${data.source}:${data.data.user.userId}`;

				const userPayload = {
					id: userId,
					userId: data.data.user.userId,
					source: data.source,
					name: data.data.user.name,
					age: data.data.user.age,
					gender: data.data.user.gender === 'non-binary' ? 'non_binary' : data.data.user.gender as Gender,
					city: data.data.user.location.city,
					country: data.data.user.location.country,
				};

				const eventPayload = {
					eventId: data.eventId,
					source: data.source,
					eventType: data.eventType,
					funnelStage: data.funnelStage,
					timestamp: new Date(data.timestamp),
					data: data.data.engagement,
					userId,
				};

				const logPayload = {
					eventId: data.eventId,
					service: `${data.source}_collector`,
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
			} catch (err) {
				console.log('Catched error:', err);
				await this.prismaService.eventLog.create({
					data: {
						eventId: data.eventId,
						service: `${data.source}_collector`,
						status: "failed",
					},
				});
				throw err;
			}
		})
	}
}
