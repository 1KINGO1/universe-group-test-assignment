import { Test, TestingModule } from '@nestjs/testing'
import { EventsService } from './events.service'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { MetricsService } from '../metrics/metrics.service'
import { Logger } from 'nestjs-pino'
import { Request, Response } from 'express'

jest.mock('stream-json/streamers/StreamArray', () => ({
  withParser: jest.fn(() => ({
    on: jest.fn(),
  })),
}))

jest.mock('stream-chain', () => ({
  chain: jest.fn(() => ({
    on: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    destroy: jest.fn(),
  })),
}))

jest.mock('uuid', () => ({
  v4: () => 'test-uuid',
}))

describe('EventsService', () => {
  let service: EventsService
  let prisma: PrismaService
  let metrics: MetricsService
  let logger: Logger

  const mockPrisma = {
    outboxEvent: {
      createMany: jest.fn(),
    },
  }

  const mockMetrics = {
    acceptedEventsCounter: { inc: jest.fn() },
    failedEventsCounter: { inc: jest.fn() },
    processedEventsCounter: { inc: jest.fn() },
  }

  const mockLogger = {
    log: jest.fn(),
    error: jest.fn(),
  }

  const mockReq = {
    setEncoding: jest.fn(),
  } as Partial<Request> as Request

  const mockRes = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    headersSent: false,
  } as Partial<Response> as Response

  beforeEach(async () => {
    jest.clearAllMocks()
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: Logger, useValue: mockLogger },
      ],
    }).compile()

    service = module.get(EventsService)
    prisma = module.get(PrismaService)
    metrics = module.get(MetricsService)
    logger = module.get(Logger)
  })

  describe('processRequest', () => {
    it('should return 503 if shutting down', async () => {
      (service as any).shuttingDown = true

      await service.processRequest(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(503)
      expect(mockRes.send).toHaveBeenCalledWith({ error: 'Service is shutting down' })
    })

    it('should process stream and return success', async () => {
      const processStreamSpy = jest
        .spyOn<any, any>(service, 'processStream')
        .mockResolvedValue(undefined)

      await service.processRequest(mockReq, mockRes)

      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.send).toHaveBeenCalledWith({ status: 'All points processed', requestId: 'test-uuid' })
      expect(processStreamSpy).toHaveBeenCalledWith(mockReq, 'test-uuid')
    })
  })

  describe('onModuleDestroy', () => {
    it('should wait for all tasks to complete', async () => {
      const mockTask = new Promise<void>(resolve => setTimeout(resolve, 10))
      ;(service as any).active.add(mockTask)

      const promise = service.onModuleDestroy()

      expect((service as any).shuttingDown).toBe(true)
      await promise
      expect(logger.log).toHaveBeenCalledWith('Shutting down... waiting for in-flight tasks')
      expect(logger.log).toHaveBeenCalledWith('All tasks completed.')
    })
  })
})
