import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService, NatsConsumerService, TiktokEvent } from '@kingo1/universe-assignment-shared';
import { MetricsService } from '../metrics/metrics.service';
import { Logger } from 'nestjs-pino';
import { Prisma } from '@prisma/client'

@Injectable()
export class EventCollectorService implements OnModuleInit {
  constructor(
    private readonly natsService: NatsConsumerService,
    private readonly prismaService: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    this.natsService.subscribe(async (events: TiktokEvent[]) => {
      const start = Date.now();
      this.logger.log({
        msg: 'Start processing event batch',
        batchSize: events.length,
        eventIds: events.slice(0, 10).map(e => e.eventId).join(','),
      });

      const userPayloads: Prisma.UserCreateManyInput[] = [];
      const eventPayloads: Prisma.EventCreateManyInput[] = [];
      const failedEvents: { eventId: string; error: Error }[] = [];

      for (const event of events) {
        try {
          const userId = `${event.source}:${event.data.user.userId}`;

          userPayloads.push({
            id: userId,
            userId: event.data.user.userId,
            source: event.source,
            name: event.data.user.username,
            followers: event.data.user.followers,
          });

          eventPayloads.push({
            eventId: event.eventId,
            source: event.source,
            eventType: event.eventType,
            funnelStage: event.funnelStage,
            timestamp: new Date(event.timestamp),
            data: event.data.engagement as never,
            userId,
          });

          this.metricsService.processedEventsCounter.inc();
        } catch (err) {
          this.metricsService.failedEventsCounter.inc();
          this.logger.error({
            msg: 'Failed to prepare event',
            eventId: event.eventId,
            error: err.message,
          });
          failedEvents.push({ eventId: event.eventId, error: err });
        }
      }

      try {
        await this.prismaService.$transaction([
          this.prismaService.user.createMany({
            data: userPayloads,
            skipDuplicates: true,
          }),
          this.prismaService.event.createMany({
            data: eventPayloads,
            skipDuplicates: true,
          }),
        ]);

        eventPayloads.forEach(() => this.metricsService.acceptedEventsCounter.inc());
      } catch (err) {
        this.logger.error({
          msg: 'Batch database operation failed',
          errorMessage: err.message,
          stack: err.stack,
          batchSize: events.length,
        });

        eventPayloads.forEach(payload => {
          this.metricsService.failedEventsCounter.inc();
          failedEvents.push({ eventId: payload.eventId, error: err });
        });
      }

      const duration = Date.now() - start;
      this.logger.log({
        msg: 'Batch processed successfully',
        batchSize: events.length,
        successful: eventPayloads.length - failedEvents.length,
        failed: failedEvents.length,
        durationMs: duration,
        cpuUsage: process.cpuUsage(),
      });

      if (failedEvents.length > 0) {
        throw new Error(`Failed to process ${failedEvents.length} events: ${failedEvents.map(f => f.eventId).join(',')}`);
      }
    });
  }
}