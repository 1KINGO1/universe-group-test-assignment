import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from "@kingo1/universe-assignment-shared";
import { MetricsService } from 'src/metrics/metrics.service';
import { Request, Response } from 'express';
import * as StreamArray from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';
import { Worker } from 'worker_threads';
import * as path from 'path';
import type { Event } from "@kingo1/universe-assignment-shared";
import type { Prisma } from '@prisma/client';

@Injectable()
export class EventsService {
	private readonly logger = new Logger(EventsService.name);

	constructor(
		private readonly prismaService: PrismaService,
		private readonly metricsService: MetricsService,
	) {}

	async processRequestBody(req: Request, res: Response) {
		const worker = new Worker(path.resolve(__dirname, 'batch-processing.worker.js'), {
			// for development, use ts-node to run TypeScript directly
			// execArgv: ['-r', 'ts-node/register'],
		});
		worker.on('error', err => this.logger.error('Worker error', err));

		const batchSize = 4000;
		let batch: Event[] = [];

		const pipeline = chain([ req, StreamArray.withParser() ]);

		pipeline.on('data', async ({ value }) => {
			batch.push(value as Event);
			if (batch.length >= batchSize) {
				pipeline.pause();
				try {
					const { outboxEvents, failedCount } = await this.processWithWorker(worker, batch);
					await this.saveBatch(outboxEvents, failedCount);
				} finally {
					batch = [];
					pipeline.resume()
				}
			}
		});

		pipeline.on('end', async () => {
			if (batch.length) {
				const { outboxEvents, failedCount } = await this.processWithWorker(worker, batch);
				await this.saveBatch(outboxEvents, failedCount);
			}
			// 2) Підриваємо воркер
			await worker.terminate();
			res.status(200).send('All points processed');
		});

		pipeline.on('error', async err => {
			this.logger.error(err);
			await worker.terminate();
			res.status(500).send('Failed to process');
		});
	}

	private processWithWorker(
		worker: Worker,
		events: Event[],
	): Promise<{ outboxEvents: Prisma.OutboxEventCreateManyInput[]; failedCount: number }> {
		return new Promise((resolve, reject) => {
			const onMessage = (msg: any) => {
				cleanup();
				resolve(msg);
			};
			const onError = (err: any) => {
				cleanup();
				reject(err);
			};

			const cleanup = () => {
				worker.off('message', onMessage);
				worker.off('error', onError);
			};

			worker.once('message', onMessage);
			worker.once('error', onError);
			worker.postMessage(events);
		});
	}

	private async saveBatch(
		outboxEvents: Prisma.OutboxEventCreateManyInput[],
		failedCount: number,
	) {
		if (!outboxEvents.length) return;

		await this.prismaService.outboxEvent.createMany({
			data: outboxEvents,
			skipDuplicates: true,
		});
		this.metricsService.processedEventsCounter.inc(outboxEvents.length);
		this.metricsService.failedEventsCounter.inc(failedCount);
		this.metricsService.acceptedEventsCounter.inc(outboxEvents.length - failedCount);
		this.logger.log(`Saved ${outboxEvents.length} events (${failedCount} failed)`);
	}
}
