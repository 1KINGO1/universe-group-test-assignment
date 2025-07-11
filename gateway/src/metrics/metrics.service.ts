import { Injectable } from '@nestjs/common'
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry,
} from 'prom-client'

@Injectable()
export class MetricsService {
  private readonly registry = new Registry()

  readonly acceptedEventsCounter: Counter<string>
  readonly processedEventsCounter: Counter<string>
  readonly failedEventsCounter: Counter<string>

  constructor() {
    collectDefaultMetrics({ register: this.registry })

    this.acceptedEventsCounter = new Counter({
      name: 'gateway_outbox_events_accepted_total',
      help: 'Total outbox accepted events',
      registers: [this.registry],
    })

    this.processedEventsCounter = new Counter({
      name: 'gateway_outbox_events_processed_total',
      help: 'Total outbox processed events',
      registers: [this.registry],
    })

    this.failedEventsCounter = new Counter({
      name: 'gateway_outbox__events_failed_total',
      help: 'Total outbox failed events',
      registers: [this.registry],
    })
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics()
  }
}
