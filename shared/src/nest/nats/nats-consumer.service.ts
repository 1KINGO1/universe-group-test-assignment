import {Inject, Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {AckPolicy, connect, NatsConnection, StringCodec} from 'nats';
import {Event} from '../../types';
import { ConfigService } from '@nestjs/config';

type HandlerFunction = (data: Event) => Promise<void>;

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
	private nc: NatsConnection;
	private sc = StringCodec();
	private handlers: HandlerFunction[];
	private started = false;

	constructor(
		private readonly configService: ConfigService
	) {}

	async onModuleInit() {
		this.handlers = [];
		this.nc = await connect({ servers: `nats://${this.configService.getOrThrow("NATS_URL")}` });
		console.log('Connected to NATS');

		const jsm = await this.nc.jetstreamManager();

		try {
			await jsm.consumers.add(this.configService.getOrThrow("NATS_STREAM"), {
				name: this.configService.getOrThrow("NATS_CONSUMER"),
				ack_policy: AckPolicy.Explicit,
			});
		} catch (err) {
			if (err.api_error?.err_code === 10148) {
				console.log("Consumer already exists, skipping creation.");
			} else {
				throw err;
			}
		}
	}

	async onModuleDestroy() {
		await this.nc.close();
		console.log('Disconnected from NATS');
	}

	private async consumeLoop() {
		const js = this.nc.jetstream();
		const c = await js.consumers.get(this.configService.getOrThrow("NATS_STREAM"), this.configService.getOrThrow("NATS_CONSUMER"));

		while (true) {
			const messages = await c.consume({ max_messages: 10 });
			try {
				for await (const m of messages) {
					const data = JSON.parse(this.sc.decode(m.data));

					try {
						await Promise.all(this.handlers.map(handler => handler(data)));
						m.ack();
					} catch (err) {
						m.nak();
					}
				}
			} catch (err) {
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		}
	}

	subscribe(handler: HandlerFunction) {
		this.handlers.push(handler);

		if (!this.started) {
			this.started = true;
			this.consumeLoop().catch(err => console.error("Consume loop failed:", err));
		}
	}
}