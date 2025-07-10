import {Injectable, ServiceUnavailableException} from '@nestjs/common';
import {PrismaService} from '@kingo1/universe-assignment-shared';

@Injectable()
export class HealthService {
	constructor(
		private readonly prismaService: PrismaService,
	) {}

	async checkReadiness() {
		const dbOk = await this.prismaService.$queryRaw`SELECT 1`;

		const isAppReady = dbOk;

		if (!isAppReady) throw new ServiceUnavailableException();

		return {status: "ready"};
	}
}
