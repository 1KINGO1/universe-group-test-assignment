import {Injectable, OnModuleDestroy, OnModuleInit} from '@nestjs/common';
import {connect, JetStreamClient, NatsConnection, StorageType, StringCodec} from 'nats';
import {Event} from '@kingo1/universe-assignment-shared';
import {ConfigService} from '@nestjs/config';

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
	private nc: NatsConnection;
	private sc = StringCodec();
	private js: JetStreamClient;

	constructor(private readonly configService: ConfigService) {}

	async onModuleInit() {
		this.nc = await connect({servers: `nats://${this.configService.getOrThrow('NATS_URL')}`});

		const jsm = await this.nc.jetstreamManager();

		await jsm.streams.add({
			name: 'FACEBOOK',
			subjects: ['facebook.>'],
			storage: StorageType.File
		});

		await jsm.streams.add({
			name: 'TIKTOK',
			subjects: ['tiktok.>'],
			storage: StorageType.File
		});


		this.js = this.nc.jetstream();
		console.log('Connected to NATS');
	}

	async onModuleDestroy() {
		await this.nc.close();
		console.log('Disconnected from NATS');
	}

	async publish(subject: string, message: Event) {
		const msgString = JSON.stringify(message);

		try {
			return await this.js.publish(`${subject}.${message.eventType}`, this.sc.encode(msgString), {
				timeout: 5000
			});
		} catch (err) {
			console.error('Failed to publish message:', err, message);
			throw err;
		}
	}
}