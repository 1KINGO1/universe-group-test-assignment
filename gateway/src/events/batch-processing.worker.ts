import { parentPort } from 'worker_threads';
import { Prisma } from '@prisma/client';
import type { Event } from "@kingo1/universe-assignment-shared";

interface ProcessResult {
	outboxEvents: Prisma.OutboxEventCreateManyInput[];
}

parentPort!.on('message', (events: Event[]) => {
	const outboxEvents: ProcessResult['outboxEvents'] = [];

	for (const event of events) {
		const base: Omit<Prisma.OutboxEventCreateManyInput, 'status' | 'error'> = {
			payload: JSON.stringify(event),
		};

		outboxEvents.push(base);
	}

	parentPort!.postMessage({ outboxEvents } as ProcessResult);
});