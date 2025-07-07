import {Injectable, OnModuleInit, OnModuleDestroy} from '@nestjs/common';
import {connect, NatsConnection, StringCodec} from 'nats';
import {Event} from '@kingo1/universe-assignment-shared';
import {ConfigService} from '@nestjs/config';

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
	private nc: NatsConnection;
	private sc = StringCodec();

	constructor(private readonly configService: ConfigService) {}

	async onModuleInit() {
		this.nc = await connect({servers: `nats://${this.configService.getOrThrow('NATS_URL')}`});
		console.log('Connected to NATS');
	}

	async onModuleDestroy() {
		await this.nc.close();
		console.log('Disconnected from NATS');
	}

	async publish(subject: string, message: Event) {
		const msgString = JSON.stringify(message);
		this.nc.publish(subject, this.sc.encode(msgString));
	}
}