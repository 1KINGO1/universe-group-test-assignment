import {Controller, Get, Res} from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { Response } from 'express';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res({passthrough: true}) res: Response) {
    res.setHeader('Content-Type', 'text/plain');
    return this.metricsService.getMetrics();
  }
}
