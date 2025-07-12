import { Prisma } from '@prisma/client'
import type { Event } from '@kingo1/universe-assignment-shared'

export interface ProcessResult {
  outboxEvents: Prisma.OutboxEventCreateManyInput[]
}

export function processEvents(
  events: Event[],
  requestId: string,
): ProcessResult {
  const outboxEvents: ProcessResult['outboxEvents'] = []

  for (const event of events) {
    const base: Omit<Prisma.OutboxEventCreateManyInput, 'status' | 'error'> = {
      payload: JSON.stringify(event),
      requestId,
    }

    outboxEvents.push(base)
  }

  return { outboxEvents }
}
