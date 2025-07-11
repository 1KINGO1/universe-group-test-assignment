import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  PrismaService,
  NatsConsumerService,
  TiktokEvent,
} from '@kingo1/universe-assignment-shared'
import { MetricsService } from '../metrics/metrics.service'

@Injectable()
export class EventCollectorService implements OnModuleInit {
  constructor(
    private readonly natsService: NatsConsumerService,
    private readonly prismaService: PrismaService,
    private readonly metricsService: MetricsService,
  ) {}

  async onModuleInit() {
    this.natsService.subscribe(async data => {
      const event = data as TiktokEvent

      try {
        const userId = `${event.source}:${event.data.user.userId}`

        const userPayload = {
          id: userId,
          userId: event.data.user.userId,
          source: event.source,
          name: event.data.user.username,
          followers: event.data.user.followers,
        }

        const eventPayload = {
          eventId: event.eventId,
          source: event.source,
          eventType: event.eventType,
          funnelStage: event.funnelStage,
          timestamp: new Date(event.timestamp),
          data: event.data.engagement,
          userId,
        }

        await this.prismaService.$transaction([
          this.prismaService.user.upsert({
            where: { id: userId },
            update: userPayload,
            create: userPayload,
          }),
          this.prismaService.event.create({
            data: eventPayload as never,
          }),
        ])
        this.metricsService.acceptedEventsCounter.inc()
      } catch (err) {
        this.metricsService.failedEventsCounter.inc()
        console.error('Caught error:', err)
        throw err
      } finally {
        this.metricsService.processedEventsCounter.inc()
      }
    })
  }
}
