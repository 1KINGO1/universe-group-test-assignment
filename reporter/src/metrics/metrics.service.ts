import { Injectable } from '@nestjs/common'
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client'

@Injectable()
export class MetricsService {
  private readonly registry = new Registry()

  readonly reportLatencyHistogram: Histogram<string>

  constructor() {
    collectDefaultMetrics({ register: this.registry })

    this.reportLatencyHistogram = new Histogram({
      name: 'reporter_report_latency_seconds',
      help: 'Report generation latency in seconds',
      labelNames: ['report_type'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    })
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics()
  }
}
