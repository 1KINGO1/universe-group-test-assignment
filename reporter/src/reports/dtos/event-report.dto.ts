import z from 'zod'
import { createZodDto } from 'nestjs-zod'

const EventsReportSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  source: z.enum(['facebook', 'tiktok']).optional(),
  funnelStage: z.enum(['top', 'bottom']).optional(),
  eventType: z.string().optional(),
})

export class EventsReportDto extends createZodDto(EventsReportSchema) {}
export type EventsReport = z.infer<typeof EventsReportSchema>
