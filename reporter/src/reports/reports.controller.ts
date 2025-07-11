import { Body, Controller, Get, Query, Req } from '@nestjs/common'
import { ReportsService } from './reports.service'
import { EventsReportDto } from './dtos/event-report.dto'
import { RevenueReportDto } from './dtos/revenue-report.dto'

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('events')
  async getEvents(@Query() queries: EventsReportDto) {
    return this.reportsService.getEventsReport(queries)
  }

  @Get('revenue')
  async getRevenue(@Query() queries: RevenueReportDto) {
    return this.reportsService.getRevenueReport(queries)
  }

  @Get('demographics')
  async getDemographics(@Query() queries: RevenueReportDto) {
    return this.reportsService.getDemographicsReport(queries)
  }
}
