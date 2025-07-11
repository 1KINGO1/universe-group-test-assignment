import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { MetricsService } from 'src/metrics/metrics.service'
import { Request, Response } from 'express'
import * as StreamArray from 'stream-json/streamers/StreamArray'
import { chain } from 'stream-chain'
import * as path from 'path'
import type { Event } from '@kingo1/universe-assignment-shared'
import type { Prisma } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { Logger } from 'nestjs-pino'
import * as workerpool from 'workerpool'

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly activeRequests = new Set<Promise<void>>()
  private shuttingDown = false
  private pool: ReturnType<typeof workerpool.pool>

  constructor(
    private readonly prismaService: PrismaService,
    private readonly metricsService: MetricsService,
    private readonly logger: Logger,
  ) {
    this.pool = workerpool.pool(path.resolve(__dirname, 'batch-processing.worker.js'), {
      maxWorkers: 6,
    })
  }

  async onModuleDestroy() {
    this.shuttingDown = true
    this.logger.log('Shutting down... waiting for in-flight requests')

    await Promise.allSettled(this.activeRequests)

    await this.pool.terminate()
    this.logger.log('Worker pool terminated.')
  }

  async processRequest(req: Request, res: Response) {
    if (this.shuttingDown) {
      res.status(503).send('Service is shutting down')
      return
    }

    const handle = this.handleStreamRequest(req, res)
    this.activeRequests.add(handle)
    handle.finally(() => this.activeRequests.delete(handle))
  }

  private async handleStreamRequest(req: Request, res: Response): Promise<void> {
    const requestId = uuidv4()
    this.logger.log({ requestId }, 'Controller: Received new events stream')

    return new Promise((resolve, reject) => {
      const batchSize = 4000
      let batch: Event[] = []
      let totalSize = 0

      const pipeline = chain([req, StreamArray.withParser()])

      pipeline.on('data', async ({ value }) => {
        batch.push(value as Event)
        totalSize++
        if (batch.length >= batchSize) {
          pipeline.pause()
          try {
            const { outboxEvents } = await this.processWithPool(batch, requestId)
            await this.saveBatch(outboxEvents, requestId)
          } catch (e) {
            pipeline.destroy(e)
            return
          } finally {
            batch = []
            pipeline.resume()
          }
        }
      })

      pipeline.on('end', async () => {
        try {
          if (batch.length) {
            const { outboxEvents } = await this.processWithPool(batch, requestId)
            await this.saveBatch(outboxEvents, requestId)
          }
          res.status(200).send('All points processed')
          this.logger.log({ totalSize, requestId }, 'Finished processing request')
          resolve()
        } catch (e) {
          this.logger.error(e)
          res.status(500).send('Failed to process')
          reject(e)
        }
      })

      pipeline.on('error', err => {
        this.logger.error(err)
        res.status(500).send('Failed to process')
        reject(err)
      })
    })
  }

  private processWithPool(events: Event[], requestId: string) {
    return this.pool.exec('processEvents', [events, requestId])
  }

  private async saveBatch(outboxEvents: Prisma.OutboxEventCreateManyInput[], requestId: string) {
    if (!outboxEvents.length) return

    try {
      await this.prismaService.outboxEvent.createMany({
        data: outboxEvents,
        skipDuplicates: true,
      })
      this.metricsService.acceptedEventsCounter.inc(outboxEvents.length)
      this.logger.log(
        {
          type: 'EVENTS',
          requestId,
          savedCount: outboxEvents.length,
        },
        'Saved events batch',
      )
    } catch (e) {
      this.logger.error(
        {
          type: 'EVENTS',
          requestId,
          failedCount: outboxEvents.length,
        },
        'Error during saving batch to DB',
      )
      this.metricsService.failedEventsCounter.inc(outboxEvents.length)
      throw e
    } finally {
      this.metricsService.processedEventsCounter.inc(outboxEvents.length)
    }
  }
}
