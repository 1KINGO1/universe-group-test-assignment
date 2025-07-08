import { Injectable } from '@nestjs/common';
import {collectDefaultMetrics, Counter, Histogram, Registry} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  readonly acceptedEventsCounter: Counter<string>;
  readonly processedEventsCounter: Counter<string>;
  readonly failedEventsCounter: Counter<string>;

  readonly reportLatencyHistogram: Histogram<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.acceptedEventsCounter = new Counter({
      name: 'gateway_events_accepted_total',
      help: 'Total accepted events',
      registers: [this.registry],
    });

    this.processedEventsCounter = new Counter({
      name: 'gateway_events_processed_total',
      help: 'Total processed events',
      registers: [this.registry],
    });

    this.failedEventsCounter = new Counter({
      name: 'gateway_events_failed_total',
      help: 'Total failed events',
      registers: [this.registry],
    });

    this.reportLatencyHistogram = new Histogram({
      name: 'gateway_report_latency_seconds',
      help: 'Report generation latency in seconds',
      labelNames: ['report_type'],
      buckets: [0.1, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }
}
