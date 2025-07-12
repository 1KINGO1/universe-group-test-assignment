import { processEvents } from './process-events'

describe('processEvents', () => {
  it('should convert events array to outboxEvents with JSON payloads', () => {
    const events = [
      { id: '1', name: 'event1 :D' },
      { id: '2', name: 'event2 :P', extra: 123 },
    ]

    const requestId = '123'

    const result = processEvents(events as any, requestId)

    expect(result).toEqual({
      outboxEvents: [
        { payload: JSON.stringify(events[0]), requestId },
        { payload: JSON.stringify(events[1]), requestId },
      ],
    })
  })

  it('should return empty outboxEvents array if input is empty', () => {
    const result = processEvents([], '123')
    expect(result).toEqual({ outboxEvents: [] })
  })
})
