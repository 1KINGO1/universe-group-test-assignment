import * as workerpool from 'workerpool'
import { processEvents } from './utils/process-events'

workerpool.worker({
  processEvents,
})
