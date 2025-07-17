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
  private readonly POLL_INTERVAL_MS: number
  private readonly BATCH_SIZE: number

  constructor(
    private readonly prisma: PrismaService,
    private readonly nats: NatsService,
    private readonly config: ConfigService,
    private readonly metrics: MetricsService,
    private readonly logger: Logger,
  ) {
    this.POLL_INTERVAL_MS = parseInt(this.config.getOrThrow('OUTBOX_POLL_INTERVAL_MS'))
    this.BATCH_SIZE = parseInt(this.config.getOrThrow('OUTBOX_BATCH_SIZE'))
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

  private async processBatch(): Promise<void> {
    const events = await this.fetchOutboxEvents()

    if (!events.length) return

    const results = await Promise.allSettled(events.map(e => this.handleEvent(e)))
    const toDelete: string[] = []
    let failed = 0

    for (const [index, result] of results.entries()) {
      const eventId = events[index].id
      if (result.status === 'fulfilled') {
        toDelete.push(eventId)
      } else {
        failed++
        this.logger.error(`Failed to process event ${eventId}: ${result.reason}`)
      }
    }

    if (toDelete.length) {
      await this.prisma.outboxEvent.deleteMany({ where: { id: { in: toDelete } } })
      this.logger.log(`Deleted ${toDelete.length} processed outbox events`)
    }

    this.metrics.processedEventsCounter.inc(events.length)
    this.metrics.acceptedEventsCounter.inc(toDelete.length - failed)
    this.metrics.failedEventsCounter.inc(failed)
  }

  private async fetchOutboxEvents(): Promise<Array<{ id: string; payload: unknown; request_id: string }>> {
    return await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<any[]>(`
        SELECT id, payload, request_id FROM "outbox_events"
        FOR UPDATE SKIP LOCKED
        LIMIT ${this.BATCH_SIZE}
      `)
      return rows || []
    })
  }

  private async handleEvent(event: { id: string; payload: any; request_id: string }) {
    const { id, payload, request_id } = event

    let parsed: OutboxEventPayload

    try {
      parsed = typeof payload === 'string' ? JSON.parse(payload) : payload
    } catch (err) {
      throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      eventSchema.parse(parsed)
    } catch (err) {
      if (err instanceof ZodError) {
        throw new Error(`Validation failed`)
      }
      throw err
    }

    await this.nats.publish(parsed.source, parsed, id, request_id)
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
