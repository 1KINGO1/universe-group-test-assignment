import z from 'zod'
import { createZodDto } from 'nestjs-zod'

const DemographicsReportSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  source: z.enum(['facebook', 'tiktok']),
})

export class DemographicsReportDto extends createZodDto(
  DemographicsReportSchema,
) {}
export type DemographicsReport = z.infer<typeof DemographicsReportSchema>
