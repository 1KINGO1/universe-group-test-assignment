import { parentPort } from 'worker_threads';
import { processEvents } from './utils/process-events';
import { Event } from '@kingo1/universe-assignment-shared';

parentPort!.on('message', (events: Event[]) => {
	const result = processEvents(events);
	parentPort!.postMessage(result);
});