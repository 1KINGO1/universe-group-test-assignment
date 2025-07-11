import { parentPort } from 'worker_threads'
import { processEvents } from './utils/process-events'
import { Event } from '@kingo1/universe-assignment-shared'

interface IncomeMessage {
  events: Event[], 
  requestId: string
}

parentPort!.on('message', ({events, requestId}: IncomeMessage) => {
  const result = processEvents(events, requestId)
  parentPort!.postMessage(result)
})
