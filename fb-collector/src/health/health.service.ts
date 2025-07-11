import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import {
  NatsConsumerService,
  PrismaService,
} from '@kingo1/universe-assignment-shared'

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly natsConsumerService: NatsConsumerService,
  ) {}

  async checkReadiness() {
    const dbOk = await this.prismaService.$queryRaw`SELECT 1`
    const natsOK = this.natsConsumerService.isConnected()

    const isAppReady = dbOk && natsOK

    if (!isAppReady) throw new ServiceUnavailableException()

    return { status: 'ready' }
  }
}
