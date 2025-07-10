import { parentPort } from 'worker_threads';
import { eventSchema } from './schemas/event.schema';
import { OutboxStatus, Prisma } from '@prisma/client';
import type { Event } from "@kingo1/universe-assignment-shared";

interface ProcessResult {
	outboxEvents: Prisma.OutboxEventCreateManyInput[];
	failedCount: number;
}

parentPort!.on('message', (events: Event[]) => {
	const outboxEvents: ProcessResult['outboxEvents'] = [];
	let failedCount = 0;

	for (const event of events) {
		const isValid = eventSchema.safeParse(event).success;
		const base: Omit<Prisma.OutboxEventCreateManyInput, 'status' | 'error'> = {
			sentAt: new Date(event.timestamp),
			source: event.source,
			eventType: event.eventType,
			payload: JSON.stringify(event.data),
		};

		if (!isValid) {
			outboxEvents.push({
				...base,
				status: OutboxStatus.FAILED,
				error: 'Invalid event format',
			});
			failedCount++;
		} else {
			outboxEvents.push(base);
		}
	}

	parentPort!.postMessage({ outboxEvents, failedCount } as ProcessResult);
});