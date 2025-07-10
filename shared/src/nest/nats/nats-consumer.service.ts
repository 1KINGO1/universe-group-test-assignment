import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {AckPolicy, connect, NatsConnection, StringCodec} from 'nats';
import {Event} from '../../types';
import {ConfigService} from '@nestjs/config';

type HandlerFunction = (data: Event) => Promise<void>;

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
	private nc: NatsConnection;
	private sc = StringCodec();
	private handlers: HandlerFunction[];
	private started = false;
	private running = false;
	private readonly batchSize = 100;

	constructor(
		private readonly configService: ConfigService
	) {
	}

	async onModuleInit() {
		this.handlers = [];
		this.running = true;
		this.nc = await connect({servers: `nats://${this.configService.getOrThrow("NATS_URL")}`});
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
		this.running = false;
		await this.nc.close();
		console.log('Disconnected from NATS');
	}

	private async consumeLoop() {
  const js = this.nc.jetstream();
  const c = await js.consumers.get(
    this.configService.getOrThrow("NATS_STREAM"),
    this.configService.getOrThrow("NATS_CONSUMER"),
  );

  while (this.running) {
    const messages = await c.fetch({ max_messages: this.batchSize });

    try {
      const promises: Promise<void>[] = [];

      for await (const m of messages) {
        const data = JSON.parse(this.sc.decode(m.data));

        promises.push(
          Promise.all(this.handlers.map(handler => handler(data)))
            .then(() => m.ack())
            .catch(() => m.nak())
        );
      }

      await Promise.all(promises);
    } catch (err) {
      console.error('Consume loop error:', err);
    }
      
	await this.delay(40);
  }
}

	private delay(ms: number) {
  		return new Promise(resolve => setTimeout(resolve, ms));
	}

	isConnected(): boolean {
		return !!this.nc && !this.nc.isClosed();
	}

	subscribe(handler: HandlerFunction) {
		this.handlers.push(handler);

		if (!this.started) {
			this.started = true;
			this.consumeLoop().catch(err => console.error("Consume loop failed:", err));
		}
	}
}