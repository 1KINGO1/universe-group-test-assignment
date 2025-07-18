import { Injectable, OnModuleInit } from '@nestjs/common'
import {
  PrismaService,
  NatsConsumerService,
  FacebookEvent,
} from '@kingo1/universe-assignment-shared'
import { Gender, Prisma } from '@prisma/client'
import { MetricsService } from '../metrics/metrics.service'
import { Logger } from 'nestjs-pino'

@Injectable()
export class EventCollectorService implements OnModuleInit {
  constructor(
    private readonly natsService: NatsConsumerService,
    private readonly prismaService: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    this.natsService.subscribe(async (events: FacebookEvent[]) => {
      const start = Date.now()
      this.logger.log({
        msg: 'Start processing event batch',
        batchSize: events.length,
        eventIds: events
          .slice(0, 10)
          .map(e => e.eventId)
          .join(','),
      })

      const userPayloads: Prisma.UserCreateManyInput[] = []
      const eventPayloads: Prisma.EventCreateManyInput[] = []
      const failedEvents: { eventId: string; error: Error }[] = []

      for (const event of events) {
        try {
          const userId = `${event.source}:${event.data.user.userId}`

          userPayloads.push({
            id: userId,
            userId: event.data.user.userId,
            source: event.source,
            name: event.data.user.name,
            age: event.data.user.age,
            gender:
              event.data.user.gender === 'non-binary'
                ? 'non_binary'
                : (event.data.user.gender as Gender),
            city: event.data.user.location.city,
            country: event.data.user.location.country,
          })

          eventPayloads.push({
            eventId: event.eventId,
            source: event.source,
            eventType: event.eventType,
            funnelStage: event.funnelStage,
            timestamp: new Date(event.timestamp),
            data: event.data.engagement as never,
            userId,
          })

          this.metricsService.processedEventsCounter.inc()
        } catch (err) {
          this.metricsService.failedEventsCounter.inc()
          this.logger.error({
            msg: 'Failed to prepare event',
            eventId: event.eventId,
            error: err.message,
          })
          failedEvents.push({ eventId: event.eventId, error: err })
        }
      }

      try {
        userPayloads.sort((a, b) => (a.id as string).localeCompare(b!.id as string))
        eventPayloads.sort((a, b) => a.eventId.localeCompare(b.eventId))

        await this.prismaService.user.createMany({ 
          data: userPayloads, 
          skipDuplicates: true 
        })
        
        await this.prismaService.event.createMany({
          data: eventPayloads,
          skipDuplicates: true,
        }),

        eventPayloads.forEach(() =>
          this.metricsService.acceptedEventsCounter.inc(),
        )
      } catch (err) {
        this.logger.error({
          msg: 'Batch database operation failed',
          errorMessage: err.message,
          stack: err.stack,
          batchSize: events.length,
        })

        eventPayloads.forEach(payload => {
          this.metricsService.failedEventsCounter.inc()
          failedEvents.push({ eventId: payload.eventId, error: err })
        })
      }

      const duration = Date.now() - start
      this.logger.log({
        msg: 'Batch processed successfully',
        batchSize: events.length,
        successful: eventPayloads.length - failedEvents.length,
        failed: failedEvents.length,
        durationMs: duration,
        cpuUsage: process.cpuUsage(),
      })

      if (failedEvents.length > 0) {
        throw new Error(
          `Failed to process ${failedEvents.length} events: ${failedEvents
            .map(f => f.eventId)
            .join(',')}`,
        )
      }
    })
  }
}
