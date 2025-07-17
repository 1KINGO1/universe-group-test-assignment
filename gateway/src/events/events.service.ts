import {
  Injectable,
  OnModuleDestroy,
  InternalServerErrorException,
} from '@nestjs/common'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { MetricsService } from 'src/metrics/metrics.service'
import { Request, Response } from 'express'
import * as StreamArray from 'stream-json/streamers/StreamArray'
import { chain } from 'stream-chain'
import type { Event } from '@kingo1/universe-assignment-shared'
import { v4 as uuidv4 } from 'uuid'
import { Logger } from 'nestjs-pino'
import { performance } from 'perf_hooks'

@Injectable()
export class EventsService implements OnModuleDestroy {
  private shuttingDown = false
  private activeTasks = new Set<Promise<void>>()
  private readonly BATCH_SIZE = 8000

  constructor(
    private readonly prismaService: PrismaService,
    private readonly metrics: MetricsService,
    private readonly logger: Logger,
  ) {}

  async onModuleDestroy() {
    this.shuttingDown = true
    this.logger.log('Shutting down... waiting for in-flight tasks')
    await Promise.allSettled(Array.from(this.activeTasks))
    this.logger.log('All tasks completed.')
  }

  async processRequest(req: Request, res: Response) {
    res.setHeader('Connection', 'close')

    if (this.shuttingDown) {
      return res.status(503).send({ error: 'Service is shutting down' })
    }

    const requestId = uuidv4()

    const task = this.handleStreamRequest(req, requestId)
      .then(() => {
        res.status(200).send({ status: 'All points processed', requestId })
      })
      .catch(err => {
        this.logger.error(err, { requestId }, 'Stream processing failed')
        res.status(500).send({ error: 'Processing failed', requestId })
      })

    this.activeTasks.add(task)
    task.finally(() => this.activeTasks.delete(task))
  }

  private async handleStreamRequest(req: Request, requestId: string): Promise<void> {
    this.logger.log({ requestId }, 'Start processing stream')
    const startTime = performance.now()

    const eventsQueue: Promise<void>[] = []
    let buffer: Event[] = []
    let totalProcessed = 0

    const flushBatch = async (): Promise<void> => {
      if (!buffer.length) return

      const currentBatch = buffer
      buffer = []

      const savePromise = this.prismaService.outboxEvent
        .createMany({
          data: currentBatch.map(e => ({
            payload: JSON.stringify(e),
            requestId,
          })),
          skipDuplicates: true,
        })
        .then(() => {
          this.incAccepted(currentBatch.length)
        })
        .catch(err => {
          this.incFailed(currentBatch.length)
          throw err
        })
        .finally(() => {
          this.incProcessed(currentBatch.length)
        })

      eventsQueue.push(savePromise)
    }

    return new Promise<void>((resolve, reject) => {
      const stream = this.createStreamPipeline(req)

      stream.on('data', ({ value }) => {
        buffer.push(value as Event)
        totalProcessed++

        if (buffer.length >= this.BATCH_SIZE) {
          stream.pause()
          flushBatch()
            .then(() => stream.resume())
            .catch(reject)
        }
      })

      stream.on('end', async () => {
        try {
          await flushBatch()
          await Promise.all(eventsQueue)
          const duration = performance.now() - startTime
          this.logger.log({ requestId, total: totalProcessed, duration }, 'Finished processing stream')
          resolve()
        } catch (error) {
          reject(error)
        }
      })

      stream.on('error', reject)
    })
  }

  private createStreamPipeline(req: Request) {
    return chain([req, StreamArray.withParser()])
  }

  private incAccepted(count: number) {
    this.metrics.acceptedEventsCounter.inc(count)
  }

  private incFailed(count: number) {
    this.metrics.failedEventsCounter.inc(count)
  }

  private incProcessed(count: number) {
    this.metrics.processedEventsCounter.inc(count)
  }
}
