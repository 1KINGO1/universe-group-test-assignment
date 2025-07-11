import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
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
export class EventsService implements OnModuleDestroy {
	private readonly logger = new Logger(EventsService.name);
	private readonly activeRequests = new Set<Promise<void>>();
	private shuttingDown = false;

	constructor(
		private readonly prismaService: PrismaService,
		private readonly metricsService: MetricsService,
	) {
	}

	async onModuleDestroy() {
		this.shuttingDown = true;
		this.logger.log('Shutting down... waiting for in-flight requests');

		await Promise.allSettled(this.activeRequests);
		this.logger.log('All in-flight events have been processed.');
	}

	async processRequest(req: Request, res: Response) {
		if (this.shuttingDown) {
			res.status(503).send('Service is shutting down');
			return;
		}

		const handle = this.handleStreamRequest(req, res);
		this.activeRequests.add(handle);

		handle.finally(() => this.activeRequests.delete(handle));
	}

	private async handleStreamRequest(req: Request, res: Response): Promise<void> {
		return new Promise((resolve, reject) => {
			const worker = new Worker(path.resolve(__dirname, 'batch-processing.worker.js'));
			worker.on('error', err => this.logger.error('Worker error', err));

			const batchSize = 4000;
			let batch: Event[] = [];
			let totalSize = 0;

			const pipeline = chain([req, StreamArray.withParser()]);

			pipeline.on('data', async ({value}) => {
				batch.push(value as Event);
				totalSize++;
				if (batch.length >= batchSize) {
					pipeline.pause();
					try {
						const {outboxEvents} = await this.processWithWorker(worker, batch);
						await this.saveBatch(outboxEvents);
					} finally {
						batch = [];
						pipeline.resume();
					}
				}
			});

			pipeline.on('end', async () => {
				if (batch.length) {
					const {outboxEvents} = await this.processWithWorker(worker, batch);
					await this.saveBatch(outboxEvents);
				}
				await worker.terminate();
				res.status(200).send('All points processed');
				this.logger.log('Finished processing events', totalSize)
				resolve();
			});

			pipeline.on('error', async err => {
				this.logger.error(err);
				await worker.terminate();
				res.status(500).send('Failed to process');
				reject();
			});
		});
	}

	private processWithWorker(
		worker: Worker,
		events: Event[],
	): Promise<{ outboxEvents: Prisma.OutboxEventCreateManyInput[] }> {
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
		outboxEvents: Prisma.OutboxEventCreateManyInput[]
	) {
		if (!outboxEvents.length) return;

		try {
			await this.prismaService.outboxEvent.createMany({
				data: outboxEvents,
				skipDuplicates: true,
			});
			this.metricsService.acceptedEventsCounter.inc(outboxEvents.length);
			this.logger.log(`Saved ${outboxEvents.length} events (0 failed)`);
		}
		catch (e) {
			console.error('Error during saving to DB', e);
			this.metricsService.failedEventsCounter.inc(outboxEvents.length);
			this.logger.log(`FAILED to Save ${outboxEvents.length} events`);
		}
		finally {
			this.metricsService.processedEventsCounter.inc(outboxEvents.length);
		}
	}
}
