import z from "zod";
import {createZodDto} from 'nestjs-zod';

const RevenueReportSchema = z.object({
	from: z.string().datetime(),
	to: z.string().datetime(),
	source: z.enum(['facebook', 'tiktok']),
});

export class RevenueReportDto extends createZodDto(RevenueReportSchema) {}
export type RevenueReport = z.infer<typeof RevenueReportSchema>;