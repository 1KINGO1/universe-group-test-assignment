import { Injectable } from '@nestjs/common';
import {Event} from "@kingo1/universe-assignment-shared";
import * as StreamArray from 'stream-json/streamers/StreamArray';
import {chain} from 'stream-chain';
import {Request, Response} from 'express';
import {NatsService} from '../nats/nats.service';

@Injectable()
export class EventsService {
	constructor(private readonly natsService: NatsService) {}

	async processRequestBody(req: Request, res: Response) {
		const pipeline = chain([
			req,
			StreamArray.withParser(),
		]);

		pipeline.on('data', async ({ value }) => {
			this.processEvent(value as Event);
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
		return this.natsService.publish(event.source, event);
	}
}
