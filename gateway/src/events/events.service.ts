import {Injectable, Logger} from '@nestjs/common';
import {Event, PrismaService} from "@kingo1/universe-assignment-shared";
import * as StreamArray from 'stream-json/streamers/StreamArray';
import {chain} from 'stream-chain';
import {Request, Response} from 'express';
import {eventSchema} from './schemas/event.schema';
import { OutboxStatus, Prisma } from '@prisma/client';
import { MetricsService } from 'src/metrics/metrics.service';

@Injectable()
export class EventsService {
	private readonly logger = new Logger(EventsService.name);

	constructor( 
		private readonly prismaService: PrismaService,
		private readonly metricsService: MetricsService
	) {}

	async processRequestBody(req: Request, res: Response) {
		const batchSize = 1000;
		let batch: Event[] = [];

		const pipeline = chain([
			req,
			StreamArray.withParser(),
		]);

		pipeline.on('data', async ({value}) => {
			batch.push(value as Event);

			if (batch.length >= batchSize) {
				pipeline.pause();
				try {
					await this.processEventBatch(batch);
					batch = [];
				} 
				catch(e) {
					console.error(e);
				} 
				finally {
					pipeline.resume();
				}
				
			}
		});

		pipeline.on('end', () => {
			this.processEventBatch(batch);
			res.status(200).send('All points processed');
		});

		pipeline.on('error', (err) => {
			console.error(err);
			res.status(500).send('Failed to process');
		});
	}

	private validateEvent(event: Event): boolean {
		const result = eventSchema.safeParse(event);
		return result.success;
	}

	private async processEventBatch(events: Event[]) {
		this.logger.log('Processing event batch: ', events.length);
		const outboxEvents: Prisma.OutboxEventCreateManyInput[] = [];
		let failedCount = 0;

		for (const event of events) {
			const isValid = this.validateEvent(event);

			const outboxEvent: Prisma.OutboxEventCreateManyInput = {
				sentAt: new Date(event.timestamp),
				source: event.source,
				eventType: event.eventType,
				payload: JSON.stringify(event),
			}

			if (!isValid) {
				outboxEvents.push({
					...outboxEvent,
					error: 'Invalid event format',
					status: OutboxStatus.FAILED
				});
				failedCount++;
				continue;
			}

			outboxEvents.push(outboxEvent);
		}

		if (outboxEvents.length === 0) {
			return;
		}

		await this.prismaService.outboxEvent.createMany({
			data: outboxEvents,
			skipDuplicates: true,
		});

		this.metricsService.processedEventsCounter.inc(outboxEvents.length);
		this.metricsService.failedEventsCounter.inc(failedCount);
		this.metricsService.acceptedEventsCounter.inc(outboxEvents.length - failedCount);
	}
}
