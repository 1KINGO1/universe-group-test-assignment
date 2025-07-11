import { Test, TestingModule } from '@nestjs/testing'
import { EventProcessorService } from './event-processor.service'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { NatsService } from 'src/nats/nats.service'
import { ConfigService } from '@nestjs/config'
import { MetricsService } from '../metrics/metrics.service'
import { OutboxStatus } from '@prisma/client'
import { eventSchema } from './schemas/event.schema'
import { ZodError } from 'zod'

describe('EventProcessorService', () => {
  let service: EventProcessorService
  let prisma: jest.Mocked<PrismaService>
  let nats: jest.Mocked<NatsService>
  let config: jest.Mocked<ConfigService>
  let metrics: jest.Mocked<MetricsService>

  beforeEach(async () => {
    prisma = {
      outboxEvent: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    } as any
    nats = { publish: jest.fn() } as any
    config = { getOrThrow: jest.fn() } as any
    metrics = {
      acceptedEventsCounter: { inc: jest.fn() },
      failedEventsCounter: { inc: jest.fn() },
      processedEventsCounter: { inc: jest.fn() },
    } as any

    config.getOrThrow.mockImplementation(key => {
      switch (key) {
        case 'OUTBOX_POLL_INTERVAL_MS':
          return '1'
        case 'OUTBOX_BATCH_SIZE':
          return '2'
        case 'OUTBOX_MAX_RETRIES':
          return '3'
      }
    })

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventProcessorService,
        { provide: PrismaService, useValue: prisma },
        { provide: NatsService, useValue: nats },
        { provide: ConfigService, useValue: config },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile()

    service = module.get<EventProcessorService>(EventProcessorService)
    // prevent infinite loop
    jest.spyOn(service as any, 'delay').mockResolvedValue(undefined)
  })

  it('should process empty batch without errors', async () => {
    ;(prisma.outboxEvent.findMany as any).mockResolvedValue([])
    await service['processBatch']()
    expect(prisma.outboxEvent.findMany).toHaveBeenCalled()
    expect(prisma.outboxEvent.updateMany).not.toHaveBeenCalled()
  })

  it('should send valid events and update status', async () => {
    const fakePayload = JSON.parse(
      '{"eventId":"ttk-fc3c6b14-6844-4222-8069-61e03538d0cc","timestamp":"2025-07-11T08:10:47.048Z","source":"tiktok","funnelStage":"bottom","eventType":"follow","data":{"user":{"userId":"c251dc59-65ed-418e-a6db-77e27f0a7a8d","username":"Mayra46","followers":143597},"engagement":{"actionTime":"2025-07-11T08:10:47.048Z","profileId":null,"purchasedItem":null,"purchaseAmount":null}}}',
    )
    ;(prisma.outboxEvent.findMany as any).mockResolvedValue([
      { id: '1', payload: fakePayload, retryCount: 0, status: 'PENDING' },
    ])
    await service['processBatch']()
    expect(nats.publish).toHaveBeenCalledWith(fakePayload.source, fakePayload)
    expect(prisma.outboxEvent.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['1'] } },
      data: expect.objectContaining({ status: OutboxStatus.SENT }),
    })
    expect(metrics.acceptedEventsCounter.inc).toHaveBeenCalledWith(1)
    expect(metrics.processedEventsCounter.inc).toHaveBeenCalledWith(1)
  })

  it('should handle JSON parse error and retry', async () => {
    ;(prisma.outboxEvent.findMany as any).mockResolvedValue([
      { id: '2', payload: 'invalid json', retryCount: 1 },
    ])
    await service['processBatch']()
    expect(prisma.$transaction).toHaveBeenCalled()
    expect(metrics.failedEventsCounter.inc).toHaveBeenCalledWith(1)
    expect(metrics.processedEventsCounter.inc).toHaveBeenCalledWith(1)
  })

  it('should stop polling on destroy and wait for current batch', async () => {
    // simulate a long-running batch
    let resolveBatch: () => void
    service['currentBatchPromise'] = new Promise<void>(res => {
      resolveBatch = res
    })
    service['polling'] = false
    const destroyPromise = service.onModuleDestroy()
    // currentBatchPromise should be awaited
    resolveBatch!()
    await destroyPromise
    // no exceptions thrown
    expect(service['polling']).toBe(false)
  })
})
