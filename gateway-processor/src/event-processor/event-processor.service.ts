import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy
} from '@nestjs/common'
import { PrismaService, Event } from '@kingo1/universe-assignment-shared'
import { NatsService } from 'src/nats/nats.service'
import { OutboxStatus } from '@prisma/client'
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
  private readonly MAX_RETRIES

  constructor(
    private readonly prisma: PrismaService,
    private readonly natsService: NatsService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger
  ) {
    this.POLL_INTERVAL_MS = parseInt(
      this.configService.getOrThrow('OUTBOX_POLL_INTERVAL_MS'),
    )
    this.BATCH_SIZE = parseInt(
      this.configService.getOrThrow('OUTBOX_BATCH_SIZE'),
    )
    this.MAX_RETRIES = parseInt(
      this.configService.getOrThrow('OUTBOX_MAX_RETRIES'),
    )
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
    const pending = await this.prisma.outboxEvent.findMany({
      where: { status: OutboxStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      select: { id: true, payload: true, retryCount: true, requestId: true },
      take: this.BATCH_SIZE,
    })
    if (!pending.length) return

    const successes: string[] = []
    const failures: { id: string; error: string; retries: number }[] = []

    for (const evt of pending) {
      try {
        const eventObj: Event =
          typeof evt.payload === 'string'
            ? JSON.parse(evt.payload)
            : evt.payload
        eventSchema.parse(eventObj)
        await this.natsService.publish(
          eventObj.source,
          eventObj as never as Event,
          evt.id,
          evt.requestId
        )
        successes.push(evt.id)
      } catch (error) {
        const retries = (evt.retryCount ?? 0) + 1
        let errorMsg = ''

        if (error instanceof ZodError) {
          errorMsg = `Validation failed`
        } else if (error instanceof SyntaxError) {
          errorMsg = `Invalid JSON: ${error.message}`
        } else if (error instanceof Error) {
          errorMsg = error.message
        } else {
          errorMsg = 'Unknown error'
        }

        failures.push({ id: evt.id, error: errorMsg, retries })
        this.logger.error(
          `Error sending ${evt.id}: ${errorMsg}, retries=${retries}`,
        )
      }
    }

    if (successes.length) {
      await this.prisma.outboxEvent.updateMany({
        where: { id: { in: successes } },
        data: { status: OutboxStatus.SENT, sentAt: new Date() },
      })
      this.logger.log(`Sent ${successes.length} outbox events`)
      this.metricsService.acceptedEventsCounter.inc(successes.length)
      this.logger.log({
        type: "EVENTS",
        msg: `Sent ${successes.length} outbox events successfully`,
        successCount: successes.length,
        eventIds: successes,
        timestamp: new Date().toISOString(),
      })
    }

    if (failures.length) {
      const ops = failures.map(f => {
        const nextStatus =
          f.retries >= this.MAX_RETRIES
            ? OutboxStatus.FAILED
            : OutboxStatus.PENDING
        return this.prisma.outboxEvent.update({
          where: { id: f.id },
          data: { status: nextStatus, error: f.error, retryCount: f.retries },
        })
      })
      await this.prisma.$transaction(ops)
      this.logger.error({
        type: "EVENTS",
        msg: `Failed to send ${failures.length} outbox events`,
        failureCount: failures.length,
        failedEvents: failures.map(f => ({
          id: f.id,
          retries: f.retries,
          status: f.retries >= this.MAX_RETRIES ? OutboxStatus.FAILED : OutboxStatus.PENDING,
          error: f.error,
        })),
        timestamp: new Date().toISOString(),
      })
      this.metricsService.failedEventsCounter.inc(failures.length)
    }

    this.metricsService.processedEventsCounter.inc(pending.length)
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
