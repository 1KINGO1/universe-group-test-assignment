import { Injectable, OnModuleDestroy } from '@nestjs/common'
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
  private active = new Set<Promise<void>>()

  constructor(
    private readonly prismaService: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger,
  ) {}

  async onModuleDestroy() {
    this.shuttingDown = true
    this.logger.log('Shutting down... waiting for in-flight tasks')
    await Promise.allSettled(Array.from(this.active))
    this.logger.log('All tasks completed.')
  }

  async processRequest(req: Request, res: Response) {
	res.setHeader('Connection', 'close');
  
    if (this.shuttingDown) {
      return res.status(503).send({ error: 'Service is shutting down' })
    }

    const requestId = uuidv4()
    const task = this.processStream(req, requestId)
      .then(() => {
        res.status(200).send({ status: 'All points processed', requestId })
      })
      .catch(err => {
        this.logger.error(err, { requestId }, 'Stream processing failed')
        if (!res.headersSent) {
          res.status(500).send({ error: 'processing failed', requestId })
        }
      })

    this.active.add(task)
    task.finally(() => this.active.delete(task))
  }

  private async processStream(req: Request, requestId: string): Promise<void> {
    this.logger.log({ requestId }, 'Start processing stream')
    const reqStart = performance.now()
    const batchSize = 8000
    let batch: Event[] = []
    const queue: Promise<void>[] = []
    let total = 0

    return new Promise<void>((resolve, reject) => {
      const pipeline = chain([req, StreamArray.withParser()])

      const flushBatch = () => {
        if (batch.length === 0) return
        const toSave = batch
        batch = []
        const p = this.prismaService.outboxEvent
          .createMany({
            data: toSave.map(e => ({ payload: JSON.stringify(e), requestId })),
            skipDuplicates: true,
          })
          .then(() => {
            this.metricsService.acceptedEventsCounter.inc(toSave.length);
          })
          .catch(err => {
            this.metricsService.failedEventsCounter.inc(total)
            reject(err)
          })
          .finally(() => {
            this.metricsService.processedEventsCounter.inc(total)
          })
        queue.push(p)
      }

      pipeline.on('data', ({ value }) => {
        batch.push(value as Event)
        total++
        if (batch.length >= batchSize) {
          pipeline.pause()
          flushBatch()
          pipeline.resume()
        }
      })

      pipeline.on('end', async () => {
        try {
          if (batch.length) flushBatch()
          await Promise.all(queue)
          const duration = performance.now() - reqStart
          this.logger.log({ requestId, total, duration }, 'Finished processing stream')
          resolve()
        } catch (e) {
          reject(e)
        }
      })

      pipeline.on('error', err => reject(err))
    })
  }
}