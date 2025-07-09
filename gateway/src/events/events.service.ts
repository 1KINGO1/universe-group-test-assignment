import { Injectable } from '@nestjs/common';
import {Event} from "@kingo1/universe-assignment-shared";
import * as StreamArray from 'stream-json/streamers/StreamArray';
import {chain} from 'stream-chain';
import {Request, Response} from 'express';
import {NatsService} from '../nats/nats.service';
import {MetricsService} from '../metrics/metrics.service';
import { eventSchema } from './schemas/event.schema';

@Injectable()
export class EventsService {
	constructor(
		private readonly natsService: NatsService,
		private readonly metricsService: MetricsService
	) {}

	async processRequestBody(req: Request, res: Response) {
		const batchSize = 500;
		let batch: Event[] = [];

		const pipeline = chain([
			req,
			StreamArray.withParser(),
		]);

		pipeline.on('data', async ({ value }) => {
			batch.push(value as Event);

			if (batch.length >= batchSize) {
				pipeline.pause();
				const batchToProcess = batch;
				batch = [];

				for (const event of batchToProcess) {
					try {
						await this.processEvent(event);
						this.metricsService.processedEventsCounter.inc();
						this.metricsService.acceptedEventsCounter.inc();
					}
					catch(e) {
						this.metricsService.processedEventsCounter.inc();
						this.metricsService.failedEventsCounter.inc();
					}
				}

				await new Promise(resolve => setTimeout(resolve, 100));
				pipeline.resume();
			}
		});

		pipeline.on('end', () => {
			res.status(200).send('All points processed');
		});

		pipeline.on('error', (err) => {
			console.error(err);
			res.status(500).send('Failed to process');
		});
	}

	processEvent(event: Event) {
		const result = eventSchema.safeParse(event);

		if (!result.success) {
			throw new Error(`Invalid event format. Errors: ${JSON.stringify(result.error.errors)}`);
		}
		const validEvent = result.data;

		return this.natsService.publish(event.source, validEvent);
	}
}
