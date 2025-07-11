import { Test, TestingModule } from '@nestjs/testing'
import { EventsService } from './events.service'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { Request, Response } from 'express'
import { Worker } from 'worker_threads'
import { MetricsService } from '../metrics/metrics.service'
import {Logger} from 'nestjs-pino';

// Mock MetricsService
jest.mock('src/metrics/metrics.service', () => ({
  MetricsService: jest.fn().mockImplementation(() => ({
    acceptedEventsCounter: { inc: jest.fn() },
    failedEventsCounter: { inc: jest.fn() },
    processedEventsCounter: { inc: jest.fn() },
  })),
}))

// Mock worker_threads
jest.mock('worker_threads', () => ({
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    postMessage: jest.fn(),
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
  })),
}))

describe('EventsService', () => {
  let service: EventsService
  let prismaService: any
  let metricsService: any
  let mockRequest: Partial<Request>
  let mockResponse: Partial<Response>

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
        }
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

    // Reset all mocks
    jest.clearAllMocks()
  })

  describe('onModuleDestroy', () => {
    it('should set shuttingDown flag and wait for active requests', async () => {
      const mockPromise = Promise.resolve();
			(service as any).activeRequests.add(mockPromise)

      await service.onModuleDestroy()

      expect((service as any).shuttingDown).toBe(true)
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
    it('should create and configure worker', async () => {
      const mockWorker = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
      }

      ;(Worker as any as jest.Mock).mockReturnValue(mockWorker)

      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(Worker).toHaveBeenCalledWith(
        expect.stringContaining('batch-processing.worker.js'),
      )
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function))
    })

    it('should handle pipeline end event', async () => {
      const mockWorker = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
      }

      ;(Worker as any as jest.Mock).mockReturnValue(mockWorker)

      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.send).toHaveBeenCalledWith('All points processed')
      expect(mockWorker.terminate).toHaveBeenCalled()
    })

    it('should handle pipeline error event', async () => {
      const mockWorker = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
      }

      ;(Worker as any as jest.Mock).mockReturnValue(mockWorker)

      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Pipeline error')), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )

      await expect(
        handleStreamRequest(mockRequest, mockResponse),
      ).rejects.toBeUndefined()

      expect(mockResponse.status).toHaveBeenCalledWith(500)
      expect(mockResponse.send).toHaveBeenCalledWith('Failed to process')
      expect(mockWorker.terminate).toHaveBeenCalled()
    })
  })

  describe('processWithWorker', () => {
    it('should process events with worker successfully', async () => {
			const events = [{ id: '1', data: 'test' }]
			const requestId = 'test-request-id'

      const mockWorker = {
        on: jest.fn(),
        once: jest.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback({ outboxEvents: [{...events[0], requestId}] }), 0)
          }
        }),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn(),
      }

      const processWithWorker = (service as any).processWithWorker.bind(service)

      const result = await processWithWorker(mockWorker, events, requestId)
			console.log(result);

      expect(result).toEqual({ outboxEvents: [{...events[0], requestId}] })
      expect(mockWorker.postMessage).toHaveBeenCalledWith({events, requestId})
    })

    it('should handle worker error', async () => {
      const mockWorker = {
        on: jest.fn(),
        once: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Worker error')), 0)
          }
        }),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn(),
      }
			const requestId = 'test-request-id'
      const events = [{ id: '1', data: 'test' }]
      const processWithWorker = (service as any).processWithWorker.bind(service)

      await expect(processWithWorker(mockWorker, events, requestId)).rejects.toThrow(
        'Worker error',
      )
      expect(mockWorker.postMessage).toHaveBeenCalledWith({events, requestId})
    })

    it('should cleanup event listeners', async () => {
      const mockWorker = {
        on: jest.fn(),
        once: jest.fn((event, callback) => {
          if (event === 'message') {
            setTimeout(() => callback({ outboxEvents: [] }), 0)
          }
        }),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn(),
      }

      const events = [{ id: '1', data: 'test' }]
      const processWithWorker = (service as any).processWithWorker.bind(service)

      await processWithWorker(mockWorker, events)

      expect(mockWorker.off).toHaveBeenCalledWith(
        'message',
        expect.any(Function),
      )
      expect(mockWorker.off).toHaveBeenCalledWith('error', expect.any(Function))
    })
  })

  describe('saveBatch', () => {
    it('should save batch successfully', async () => {
      const outboxEvents = [
        { id: '1', eventType: 'test', payload: {} },
        { id: '2', eventType: 'test2', payload: {} },
      ]

      ;(prismaService.outboxEvent.createMany as jest.Mock).mockResolvedValue({
        count: 2,
      })

      const saveBatch = (service as any).saveBatch.bind(service)
      await saveBatch(outboxEvents)

      expect(prismaService.outboxEvent.createMany).toHaveBeenCalledWith({
        data: outboxEvents,
        skipDuplicates: true,
      })
      expect(metricsService.acceptedEventsCounter.inc).toHaveBeenCalledWith(2)
      expect(metricsService.processedEventsCounter.inc).toHaveBeenCalledWith(2)
    })

    it('should handle empty batch', async () => {
      const saveBatch = (service as any).saveBatch.bind(service)
      await saveBatch([])

      expect(prismaService.outboxEvent.createMany).not.toHaveBeenCalled()
      expect(metricsService.acceptedEventsCounter.inc).not.toHaveBeenCalled()
      expect(metricsService.processedEventsCounter.inc).not.toHaveBeenCalled()
    })

    it('should handle database error', async () => {
      const outboxEvents = [{ id: '1', eventType: 'test', payload: {} }]

      const dbError = new Error('Database error');
			(prismaService.outboxEvent.createMany as jest.Mock).mockRejectedValue(
        dbError,
      )
			const requestId = 'test-request-id'

      const saveBatch = (service as any).saveBatch.bind(service)

			await expect(saveBatch(outboxEvents, requestId)).rejects.toThrow(dbError)
      expect(mockLoggerService.error).toHaveBeenCalled()
      expect(metricsService.failedEventsCounter.inc).toHaveBeenCalledWith(1)
      expect(metricsService.processedEventsCounter.inc).toHaveBeenCalledWith(1)
      expect(metricsService.acceptedEventsCounter.inc).not.toHaveBeenCalled()
    })

    it('should always increment processed counter', async () => {
      const outboxEvents = [{ id: '1', eventType: 'test', payload: {} }];

			const dbError = new Error('DB Error');

			(prismaService.outboxEvent.createMany as jest.Mock).mockRejectedValue(
				dbError,
      )
			const requestId = 'test-request-id'

      const saveBatch = (service as any).saveBatch.bind(service)

			await expect(saveBatch(outboxEvents, requestId)).rejects.toThrow(dbError)
			expect(mockLoggerService.error).toHaveBeenCalled()
      expect(metricsService.processedEventsCounter.inc).toHaveBeenCalledWith(1)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete request flow', async () => {
      const mockWorker = {
        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        postMessage: jest.fn(),
        terminate: jest.fn().mockResolvedValue(undefined),
      }

      ;(Worker as any as jest.Mock).mockReturnValue(mockWorker)
      ;(prismaService.outboxEvent.createMany as jest.Mock).mockResolvedValue({
        count: 1,
      })

      const processWithWorkerSpy = jest
        .spyOn(service as any, 'processWithWorker')
        .mockResolvedValue({ outboxEvents: [{ id: '1' }] })

      const { chain } = require('stream-chain')
      const mockPipeline = {
        on: jest.fn((event, callback) => {
          if (event === 'end') {
            setTimeout(() => callback(), 0)
          }
        }),
        pause: jest.fn(),
        resume: jest.fn(),
      }
      chain.mockReturnValue(mockPipeline)

      const handleStreamRequest = (service as any).handleStreamRequest.bind(
        service,
      )
      await handleStreamRequest(mockRequest, mockResponse)

      expect(mockResponse.status).toHaveBeenCalledWith(200)
      expect(mockResponse.send).toHaveBeenCalledWith('All points processed')
    })

    it('should handle service shutdown during request', async () => {
      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )

      // Simulate shutdown
      ;(service as any).shuttingDown = true

      await service.processRequest(
        mockRequest as Request,
        mockResponse as Response,
      )

      expect(mockResponse.status).toHaveBeenCalledWith(503)
      expect(mockResponse.send).toHaveBeenCalledWith('Service is shutting down')
    })
  })
})
