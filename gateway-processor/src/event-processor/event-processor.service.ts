import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaService, Event as OutboxEventPayload } from '@kingo1/universe-assignment-shared'
import { NatsService } from 'src/nats/nats.service'
import { ConfigService } from '@nestjs/config'
import { MetricsService } from '../metrics/metrics.service'
import { eventSchema } from './schemas/event.schema'
import { ZodError } from 'zod'
import { Logger } from 'nestjs-pino'

@Injectable()
export class EventProcessorService implements OnModuleInit, OnModuleDestroy {
  private polling = true
  private currentBatchPromise: Promise<void> | null = null
  private readonly POLL_INTERVAL_MS
  private readonly BATCH_SIZE

  constructor(
    private readonly prisma: PrismaService,
    private readonly natsService: NatsService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger,
  ) {
    this.POLL_INTERVAL_MS = parseInt(this.configService.getOrThrow('OUTBOX_POLL_INTERVAL_MS'))
    this.BATCH_SIZE = parseInt(this.configService.getOrThrow('OUTBOX_BATCH_SIZE'))
  }

  async onModuleInit() {
    this.logger.log('Starting outbox event processor...')
    this.polling = true
    this.processLoop()
  }

  async onModuleDestroy() {
    this.logger.log('Stopping outbox event processor...')
    this.polling = false
    if (this.currentBatchPromise) {
      this.logger.log('Waiting for current batch to finish...')
      try {
        await this.currentBatchPromise
        this.logger.log('Current batch completed')
      } catch (err) {
        this.logger.error('Error during final batch:', err.message)
      }
    }
    this.logger.log('Outbox event processor stopped')
  }

  private async processLoop() {
    while (this.polling) {
      try {
        this.currentBatchPromise = this.processBatch()
        await this.currentBatchPromise
      } catch (err) {
        this.logger.error(`Batch processing error: ${err.message}`)
      }
      await this.delay(this.POLL_INTERVAL_MS)
    }
  }

  private async processBatch() {
    const events = await this.prisma.$transaction(async tx => {
      const locked = await tx.$queryRawUnsafe<any[]>(`
        SELECT id, payload, request_id FROM "outbox_events"
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.BATCH_SIZE}
      `)

      const ids = locked.map(e => e.id)

      return ids.length ? locked : []
    })

    if (!events.length) return

    const eventsToDelete: string[] = [];
    let failedCount = 0;

    for (const evt of events) {
      try {
        const payload: OutboxEventPayload =
          typeof evt.payload === 'string' ? JSON.parse(evt.payload) : evt.payload

        eventSchema.parse(payload)

        await this.natsService.publish(
          payload.source,
          payload,
          evt.id,
          evt.request_id
        )

        eventsToDelete.push(evt.id)
      } catch (error) {
        let msg = 'Unknown error'
        if (error instanceof ZodError) msg = 'Validation failed'
        else if (error instanceof SyntaxError) msg = 'Invalid JSON: ' + error.message
        else if (error instanceof Error) msg = error.message

        eventsToDelete.push(evt.id)
        failedCount++;

        this.logger.error(`Failed to send outbox event ${evt.id}: ${msg}`);
        
      }
    }

    if (eventsToDelete.length) {
      await this.prisma.outboxEvent.deleteMany({
        where: { id: { in: eventsToDelete } },
      })

      this.logger.log(`Successfully processed and deleted ${eventsToDelete.length} outbox events`)
    }

    this.metricsService.processedEventsCounter.inc(events.length)
    this.metricsService.acceptedEventsCounter.inc(eventsToDelete.length - failedCount)
    this.metricsService.failedEventsCounter.inc(failedCount)
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
