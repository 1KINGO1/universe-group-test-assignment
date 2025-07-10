import {Injectable, ServiceUnavailableException} from '@nestjs/common';
import {PrismaService} from '@kingo1/universe-assignment-shared';
import { NatsService } from 'src/nats/nats.service';

@Injectable()
export class HealthService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly natsService: NatsService
	) {}

	async checkReadiness() {
		const dbOk = await this.prismaService.$queryRaw`SELECT 1`;
		const natsOK = this.natsService.isConnected();

		const isAppReady = dbOk && natsOK;

		if (!isAppReady) throw new ServiceUnavailableException();

		return {status: "ready"};
	}
}
