import { Test, TestingModule } from '@nestjs/testing'
import { EventProcessorService } from './event-processor.service'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { NatsService } from 'src/nats/nats.service'
import { ConfigService } from '@nestjs/config'
import { MetricsService } from '../metrics/metrics.service'
import { Logger } from 'nestjs-pino'
import { ZodError } from 'zod'

jest.mock('./schemas/event.schema', () => ({
  eventSchema: { parse: jest.fn() },
}))

describe('EventProcessorService', () => {
  let service: EventProcessorService
  let prisma: jest.Mocked<PrismaService>
  let nats: jest.Mocked<NatsService>
  let config: jest.Mocked<ConfigService>
  let metrics: jest.Mocked<MetricsService>
  let logger: jest.Mocked<Logger>

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn().mockImplementation(async cb => {
        const tx = {
          $queryRawUnsafe: jest.fn().mockResolvedValue(txResult),
        }
        return cb(tx as any)
      }),
      outboxEvent: {
        deleteMany: jest.fn(),
      },
    } as any

    nats = {
      publish: jest.fn(),
    } as any

    config = {
      getOrThrow: jest.fn(key => {
        switch (key) {
          case 'OUTBOX_POLL_INTERVAL_MS': return '1'
          case 'OUTBOX_BATCH_SIZE': return '2'
          case 'OUTBOX_MAX_RETRIES': return '3'
        }
      }),
    } as any

    metrics = {
      acceptedEventsCounter: { inc: jest.fn() },
      failedEventsCounter: { inc: jest.fn() },
      processedEventsCounter: { inc: jest.fn() },
    } as any

    logger = {
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      debug: jest.fn(),
    } as any

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventProcessorService,
        { provide: PrismaService, useValue: prisma },
        { provide: NatsService, useValue: nats },
        { provide: ConfigService, useValue: config },
        { provide: MetricsService, useValue: metrics },
        { provide: Logger, useValue: logger },
      ],
    }).compile()

    service = module.get<EventProcessorService>(EventProcessorService)

    jest.spyOn(service as any, 'delay').mockResolvedValue(undefined)
  })

  let txResult: any[]

  it('should skip empty event batch', async () => {
    txResult = []

    await service['processBatch']()

    expect(prisma.outboxEvent.deleteMany).not.toHaveBeenCalled()
    expect(metrics.processedEventsCounter.inc).not.toHaveBeenCalled()
  })

  it('should process valid event and delete it', async () => {
    const now = Date.now()
    txResult = [{
      id: '1',
      payload: JSON.stringify({
        id: '123',
        type: 'user.created',
        source: 'users',
        timestamp: now,
        version: '1',
        data: { name: 'Alice' },
      }),
      request_id: 'req-1',
    }]

    await service['processBatch']()

    expect(nats.publish).toHaveBeenCalledWith(
      'users',
      JSON.parse(txResult[0].payload),
      '1',
      'req-1'
    )

    expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['1'] } },
    })
    expect(metrics.acceptedEventsCounter.inc).toHaveBeenCalledWith(1)
    expect(metrics.failedEventsCounter.inc).toHaveBeenCalledWith(0)
    expect(metrics.processedEventsCounter.inc).toHaveBeenCalledWith(1)
  })

  it('should handle JSON parse error and delete event', async () => {
    txResult = [{
      id: '2',
      payload: '{invalid json',
      request_id: 'req-2',
    }]

    await service['processBatch']()

    expect(nats.publish).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid JSON')
    )
    expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['2'] } },
    })
    expect(metrics.acceptedEventsCounter.inc).toHaveBeenCalledWith(0)
    expect(metrics.failedEventsCounter.inc).toHaveBeenCalledWith(1)
    expect(metrics.processedEventsCounter.inc).toHaveBeenCalledWith(1)
  })

  it('should handle Zod validation error and delete event', async () => {
    txResult = [{
      id: '3',
      payload: JSON.stringify({ foo: 'bar' }),
      request_id: 'req-3',
    }]
    const { eventSchema } = require('./schemas/event.schema')
    eventSchema.parse.mockImplementation(() => { throw new ZodError([]) })

    await service['processBatch']()

    expect(nats.publish).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Validation failed')
    )
    expect(prisma.outboxEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['3'] } },
    })
    expect(metrics.acceptedEventsCounter.inc).toHaveBeenCalledWith(0)
    expect(metrics.failedEventsCounter.inc).toHaveBeenCalledWith(1)
    expect(metrics.processedEventsCounter.inc).toHaveBeenCalledWith(1)
  })

  it('should wait for current batch on shutdown', async () => {
    let resolveFn!: () => void
    service['currentBatchPromise'] = new Promise<void>(res => { resolveFn = res })
    const shutdown = service.onModuleDestroy()
    resolveFn!()
    await shutdown

    expect(logger.log).toHaveBeenCalledWith('Waiting for current batch to finish...')
  })
})
