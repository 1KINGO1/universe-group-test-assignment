import { Test, TestingModule } from '@nestjs/testing'
import { ReportsService } from './reports.service'
import { PrismaService } from '@kingo1/universe-assignment-shared'
import { MetricsService } from '../metrics/metrics.service'
import { EventsReport } from './dtos/event-report.dto'
import { RevenueReport } from './dtos/revenue-report.dto'
import { DemographicsReport } from './dtos/demographics-report.dto'

describe('ReportsService', () => {
  let service: ReportsService
  let prismaService: {
    event: {
      count: jest.Mock
      groupBy: jest.Mock
    }
    user: {
      count: jest.Mock
      groupBy: jest.Mock
      aggregate: jest.Mock
    }
    $queryRawUnsafe: jest.Mock
  }
  let endMock: jest.Mock

  beforeEach(async () => {
    endMock = jest.fn()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: PrismaService,
          useValue: {
            event: {
              count: jest.fn(),
              groupBy: jest.fn(),
            },
            user: {
              count: jest.fn(),
              groupBy: jest.fn(),
              aggregate: jest.fn(),
            },
            $queryRawUnsafe: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            reportLatencyHistogram: {
              startTimer: jest.fn(() => endMock),
            },
          },
        },
      ],
    }).compile()

    service = module.get(ReportsService)
    prismaService = module.get(PrismaService)
  })

  it('should return events report', async () => {
    const query: EventsReport = {
      source: 'facebook',
      funnelStage: 'top',
      eventType: 'purchase',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-31T23:59:59Z',
    }

    prismaService.event.count.mockResolvedValue(10)
    prismaService.event.groupBy
      .mockResolvedValueOnce([
        { eventType: 'purchase', _count: { eventType: 5 } },
      ])
      .mockResolvedValueOnce([{ source: 'facebook', _count: { source: 10 } }])

    const result = await service.getEventsReport(query)

    expect(result).toEqual({
      totalEvents: 10,
      byEventType: { purchase: 5 },
      bySource: { facebook: 10 },
    })
    expect(endMock).toHaveBeenCalled()
  })

  it('should return revenue report', async () => {
    const query: RevenueReport = {
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-31T23:59:59Z',
      source: 'facebook',
    }

    prismaService.$queryRawUnsafe.mockResolvedValue([{ totalRevenue: 200.5 }])

    const result = await service.getRevenueReport(query)
    expect(result).toEqual({ totalRevenue: 200.5 })
    expect(prismaService.$queryRawUnsafe).toHaveBeenCalled()
    expect(endMock).toHaveBeenCalled()
  })

  it('should return facebook demographic report', async () => {
    const query: DemographicsReport = {
      source: 'facebook',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-31T23:59:59Z',
    }

    prismaService.user.count.mockResolvedValue(100)
    prismaService.user.groupBy
      .mockResolvedValueOnce([{ gender: 'male', _count: { gender: 70 } }])
      .mockResolvedValueOnce([{ age: 25, _count: { age: 50 } }])
      .mockResolvedValueOnce([{ country: 'US', _count: { country: 80 } }])
      .mockResolvedValueOnce([{ city: 'NY', _count: { city: 30 } }])

    const result = await service.getDemographicsReport(query)

    expect(result).toEqual({
      source: 'facebook',
      totalUsers: 100,
      byGender: { male: 70 },
      byAge: { '25': 50 },
      byCountry: { US: 80 },
      byCity: { NY: 30 },
    })
    expect(endMock).toHaveBeenCalled()
  })

  it('should return tiktok demographic report', async () => {
    const query: DemographicsReport = {
      source: 'tiktok',
      from: '2024-01-01T00:00:00Z',
      to: '2024-01-31T23:59:59Z',
    }

    prismaService.user.count.mockResolvedValue(50)
    prismaService.user.aggregate.mockResolvedValue({
      _avg: { followers: 300 },
      _min: { followers: 100 },
      _max: { followers: 900 },
    })

    const result = await service.getDemographicsReport(query)

    expect(result).toEqual({
      source: 'tiktok',
      totalUsers: 50,
      avgFollowers: 300,
      minFollowers: 100,
      maxFollowers: 900,
    })
    expect(endMock).toHaveBeenCalled()
  })
})
