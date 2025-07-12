import { Test, TestingModule } from '@nestjs/testing'
import { EventsService } from './events.service'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { Request, Response } from 'express'
import * as workerpool from 'workerpool'
import { MetricsService } from '../metrics/metrics.service'
import { Logger } from 'nestjs-pino'

// Mock MetricsService
jest.mock('src/metrics/metrics.service', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    acceptedEventsCounter: { inc: jest.fn() },
    failedEventsCounter: { inc: jest.fn() },
    processedEventsCounter: { inc: jest.fn() },
  })),
}))

// Mock workerpool
jest.mock('workerpool', () => ({
  pool: jest.fn().mockImplementation(() => ({
    exec: jest.fn(),
    terminate: jest.fn().mockResolvedValue(undefined),
  })),
}))

// Mock stream-json
jest.mock('stream-json/streamers/StreamArray', () => ({
  withParser: jest.fn(() => ({
    on: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
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

describe('EventsService', () => {
  let service: EventsService
  let prismaService: any
  let metricsService: any
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>
  let mockPool: any

  const mockPrismaService = {
    outboxEvent: {
      createMany: jest.fn(),
    },
  }

  const mockMetricsService = {
    acceptedEventsCounter: { inc: jest.fn() },
    failedEventsCounter: { inc: jest.fn() },
    processedEventsCounter: { inc: jest.fn() },
  }

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
  }

  beforeEach(async () => {
    jest.clearAllMocks()

    mockPool = {
      exec: jest.fn(),
      terminate: jest.fn().mockResolvedValue(undefined),
    }
    ;(workerpool.pool as jest.Mock).mockReturnValue(mockPool)

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: Logger,
          useValue: mockLoggerService,
        },
      ],
    }).compile()

    service = module.get<EventsService>(EventsService)
    prismaService = module.get(PrismaService)
    metricsService = module.get(MetricsService)

    // Setup mock request and response
    mockRequest = {
      pipe: jest.fn(),
    } as Partial<Request>

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    } as Partial<Response>
  })

  describe('constructor', () => {
    it('should create worker pool on initialization', () => {
      expect(workerpool.pool).toHaveBeenCalledWith(
        expect.stringContaining('batch-processing.worker.js'),
        { maxWorkers: 6 },
      )
    })
  })

  describe('onModuleDestroy', () => {
    it('should set shuttingDown flag and wait for active requests', async () => {
      const mockPromise = Promise.resolve()
      ;(service as any).activeRequests.add(mockPromise)

      await service.onModuleDestroy()

      expect((service as any).shuttingDown).toBe(true)
      expect(mockPool.terminate).toHaveBeenCalled()
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Shutting down... waiting for in-flight requests',
      )
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Worker pool terminated.',
      )
    })

    it('should wait for all active requests to complete', async () => {
      const mockPromise1 = new Promise(resolve => setTimeout(resolve, 100))
      const mockPromise2 = new Promise(resolve => setTimeout(resolve, 50))

      ;(service as any).activeRequests.add(mockPromise1)
      ;(service as any).activeRequests.add(mockPromise2)

      const startTime = Date.now()
      await service.onModuleDestroy()
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(90)
      expect((service as any).shuttingDown).toBe(true)
      expect(mockPool.terminate).toHaveBeenCalled()
    })
  })

  describe('processRequest', () => {
    it('should return 503 when shutting down', async () => {
      ;(service as any).shuttingDown = true

      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )

      expect(mockResponse.status).toHaveBeenCalledWith(503)
      expect(mockResponse.send).toHaveBeenCalledWith('Service is shutting down')
    })

    it('should handle stream request when not shutting down', async () => {
      const handleStreamRequestSpy = jest
        .spyOn(service as any, 'handleStreamRequest')
        .mockResolvedValue(undefined)

      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )

      expect(handleStreamRequestSpy).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
      )
    })

    it('should manage active requests correctly', async () => {
      const handleStreamRequestSpy = jest
        .spyOn(service as any, 'handleStreamRequest')
        .mockResolvedValue(undefined)

      const initialSize = (service as any).activeRequests.size
      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )
      const finalSize = (service as any).activeRequests.size

      expect(initialSize).toBe(0)
      expect(finalSize).toBe(0)
      expect(handleStreamRequestSpy).toHaveBeenCalled()
    })
  })

  describe('handleStreamRequest', () => {
    it('should create and configure streaming pipeline', async () => {
      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        destroy: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(mockPipeline.on).toHaveBeenCalledWith('data', expect.any(Function))
      expect(mockPipeline.on).toHaveBeenCalledWith('end', expect.any(Function))
      expect(mockPipeline.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      )
    })

    it('should handle pipeline end event', async () => {
      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        destroy: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.send).toHaveBeenCalledWith('All points processed')
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: expect.any(String) }),
        'Controller: Received new events stream',
      )
    })

    it('should handle pipeline error event', async () => {
      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Pipeline error')), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        destroy: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )

      await expect(
        handleStreamRequest(mockRequest, mockResponse),
      ).rejects.toThrow('Pipeline error')

      expect(mockResponse.status).toHaveBeenCalledWith(500)
      expect(mockResponse.send).toHaveBeenCalledWith('Failed to process')
      expect(mockLoggerService.error).toHaveBeenCalled()
    })

    it('should process batches when batch size is reached', async () => {
      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            // Simulate receiving 4000 events to trigger batch processing
            for (let i = 0; i < 4000; i++) {
              callback({ value: { id: i, data: `test-${i}` } })
            }
          }
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        destroy: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      mockPool.exec.mockResolvedValue({ outboxEvents: [] })
      const saveBatchSpy = jest
        .spyOn(service as any, 'saveBatch')
        .mockResolvedValue(undefined)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(mockPipeline.pause).toHaveBeenCalled()
      expect(mockPipeline.resume).toHaveBeenCalled()
      expect(saveBatchSpy).toHaveBeenCalled()
    })
  })

  describe('processWithPool', () => {
    it('should process events with worker pool successfully', async () => {
      const events = [{ id: '1', data: 'test' }]
      const requestId = 'test-request-id'
      const expectedResult = { outboxEvents: [{ ...events[0], requestId }] }

      mockPool.exec.mockResolvedValue(expectedResult)

      const processWithPool = (service as any).processWithPool.bind(service)
      const result = await processWithPool(events, requestId)

      expect(result).toEqual(expectedResult)
      expect(mockPool.exec).toHaveBeenCalledWith('processEvents', [
        events,
        requestId,
      ])
    })

    it('should handle worker pool error', async () => {
      const events = [{ id: '1', data: 'test' }]
      const requestId = 'test-request-id'
      const poolError = new Error('Pool error')

      mockPool.exec.mockRejectedValue(poolError)

      const processWithPool = (service as any).processWithPool.bind(service)

      await expect(processWithPool(events, requestId)).rejects.toThrow(
        'Pool error',
      )
      expect(mockPool.exec).toHaveBeenCalledWith('processEvents', [
        events,
        requestId,
      ])
    })
  })

  describe('saveBatch', () => {
    it('should save batch successfully', async () => {
      const outboxEvents = [
        { id: '1', eventType: 'test', payload: {} },
        { id: '2', eventType: 'test2', payload: {} },
      ]
      const requestId = 'test-request-id'

      ;(prismaService.outboxEvent.createMany as jest.Mock).mockResolvedValue({
        count: 2,
      })

      const saveBatch = (service as any).saveBatch.bind(service)
      await saveBatch(outboxEvents, requestId)

      expect(prismaService.outboxEvent.createMany).toHaveBeenCalledWith({
        data: outboxEvents,
        skipDuplicates: true,
      })
      expect(metricsService.acceptedEventsCounter.inc).toHaveBeenCalledWith(2)
      expect(metricsService.processedEventsCounter.inc).toHaveBeenCalledWith(2)
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        {
          type: 'EVENTS',
          requestId,
          savedCount: 2,
        },
        'Saved events batch',
      )
    })

    it('should handle empty batch', async () => {
      const requestId = 'test-request-id'
      const saveBatch = (service as any).saveBatch.bind(service)
      await saveBatch([], requestId)

      expect(prismaService.outboxEvent.createMany).not.toHaveBeenCalled()
      expect(metricsService.acceptedEventsCounter.inc).not.toHaveBeenCalled()
      expect(metricsService.processedEventsCounter.inc).not.toHaveBeenCalled()
    })

    it('should handle database error', async () => {
      const outboxEvents = [{ id: '1', eventType: 'test', payload: {} }]
      const requestId = 'test-request-id'
      const dbError = new Error('Database error')

      ;(prismaService.outboxEvent.createMany as jest.Mock).mockRejectedValue(
        dbError,
      )

      const saveBatch = (service as any).saveBatch.bind(service)

      await expect(saveBatch(outboxEvents, requestId)).rejects.toThrow(dbError)
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        {
          type: 'EVENTS',
          requestId,
          failedCount: 1,
        },
        'Error during saving batch to DB',
      )
      expect(metricsService.failedEventsCounter.inc).toHaveBeenCalledWith(1)
      expect(metricsService.processedEventsCounter.inc).toHaveBeenCalledWith(1)
      expect(metricsService.acceptedEventsCounter.inc).not.toHaveBeenCalled()
    })

    it('should always increment processed counter', async () => {
      const outboxEvents = [{ id: '1', eventType: 'test', payload: {} }]
      const requestId = 'test-request-id'
      const dbError = new Error('DB Error')

      ;(prismaService.outboxEvent.createMany as jest.Mock).mockRejectedValue(
        dbError,
      )

      const saveBatch = (service as any).saveBatch.bind(service)

      await expect(saveBatch(outboxEvents, requestId)).rejects.toThrow(dbError)
      expect(metricsService.processedEventsCounter.inc).toHaveBeenCalledWith(1)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete request flow', async () => {
      mockPool.exec.mockResolvedValue({ outboxEvents: [{ id: '1' }] })
      ;(prismaService.outboxEvent.createMany as jest.Mock).mockResolvedValue({
        count: 1,
      })

      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
        destroy: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.send).toHaveBeenCalledWith('All points processed')
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.objectContaining({ requestId: expect.any(String) }),
        'Controller: Received new events stream',
      )
    })

    it('should handle service shutdown during request', async () => {
      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )
      ;(service as any).shuttingDown = true

      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )

      expect(mockResponse.status).toHaveBeenCalledWith(503)
      expect(mockResponse.send).toHaveBeenCalledWith('Service is shutting down')
    })

    it('should handle worker pool termination on module destroy', async () => {
      await service.onModuleDestroy()

      expect(mockPool.terminate).toHaveBeenCalled()
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        'Worker pool terminated.',
      )
    })
  })
})
