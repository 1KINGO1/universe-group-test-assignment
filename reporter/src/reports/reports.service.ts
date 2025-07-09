import { Injectable } from '@nestjs/common';
import {EventsReport} from './dtos/event-report.dto';
import {FacebookEventType, PrismaService, TiktokEventType} from '@kingo1/universe-assignment-shared';
import {RevenueReport} from './dtos/revenue-report.dto';
import {DemographicsReport} from './dtos/demographics-report.dto';
import {MetricsService} from '../metrics/metrics.service';

// TODO: Move it somewhere else
type Event = FacebookEventType | TiktokEventType;
const REVENUE_EVENTS: Event[] = ['purchase', 'checkout.complete']

@Injectable()
export class ReportsService {
	constructor(
		private readonly prismaService: PrismaService,
		private readonly metricsService: MetricsService
	) {}

	async getEventsReport(queries: EventsReport) {
		const end = this.metricsService.reportLatencyHistogram.startTimer({ report_type: 'events' });

		try {
			const where: Record<string, any> = {};

			if (queries.source) {
				where.source = queries.source;
			}
			if (queries.funnelStage) {
				where.funnelStage = queries.funnelStage;
			}
			if (queries.eventType) {
				where.eventType = queries.eventType;
			}
			if (queries.from || queries.to) {
				where.timestamp = {};
				if (queries.from) where.timestamp.gte = new Date(queries.from);
				if (queries.to) where.timestamp.lte = new Date(queries.to);
			}

			const totalEvents = await this.prismaService.event.count({ where });

			const byEventType = await this.prismaService.event.groupBy({
				by: ['eventType'],
				where,
				_count: { eventType: true },
			});

			const bySource = await this.prismaService.event.groupBy({
				by: ['source'],
				where,
				_count: { source: true },
			});

			return {
				totalEvents,
				byEventType: Object.fromEntries(byEventType.map(e => [e.eventType, e._count.eventType])),
				bySource: Object.fromEntries(bySource.map(e => [e.source, e._count.source])),
			};
		}
		catch (e) {
			console.error('Error creating event report:', e);
			throw e;
		}
		finally {
			end();
		}
	}

	async getRevenueReport(queries: RevenueReport): Promise<any> {
		const end = this.metricsService.reportLatencyHistogram.startTimer({ report_type: 'revenue' });

		try {
			const { from, to, source } = queries;

			const where: any = {
				eventType: { in: REVENUE_EVENTS },
			};

			if (from && to) {
				where.timestamp = {
					gte: from,
					lte: to,
				};
			}

			if (source) {
				where.source = source;
			}

			const baseQuery = `
  SELECT SUM((data->>'purchaseAmount')::numeric) AS "totalRevenue"
  FROM "events"
  WHERE "event_type" IN ('checkout.complete', 'purchase')
    AND "timestamp" BETWEEN $1::timestamp AND $2::timestamp
		`;

			const params = [from, to];

			let query = baseQuery;

			if (queries.source) {
				query += ` AND "source" = $3::sources`;
				params.push(queries.source);
			}

			const result = await this.prismaService.$queryRawUnsafe<{totalRevenue: number}>(query, ...params);

			return {
				totalRevenue: result[0]?.totalRevenue ?? 0,
			};
		} catch (e) {
			console.error('Error creating revenue report:', e);
			throw e;
		} finally {
			end();
		}
	}

	async getDemographicsReport(queries: DemographicsReport) {
		const end = this.metricsService.reportLatencyHistogram.startTimer({ report_type: 'demographic' });

		try {
			const { source, from, to } = queries;

			const dateFilter = {
				events: {
					some: {
						timestamp: {
							gte: new Date(from),
							lte: new Date(to),
						},
					},
				},
			};

			const totalUsers = await this.prismaService.user.count({
				where: {
					source,
					...dateFilter,
				}
			});

			// TODO: ?
			if (source === 'facebook') {
				// const [
				// 	byGender,
				// 	byAge,
				// 	byCountry,
				// 	byCity,
				// ] = await Promise.all([
				// 	this.prismaService.user.groupBy({
				// 		by: ['gender'],
				// 		where: { source, ...dateFilter },
				// 		_count: { gender: true },
				// 	}),
				// 	this.prismaService.user.groupBy({
				// 		by: ['age'],
				// 		where: { source, ...dateFilter },
				// 		_count: { age: true },
				// 	}),
				// 	this.prismaService.user.groupBy({
				// 		by: ['country'],
				// 		where: { source, ...dateFilter },
				// 		_count: { country: true },
				// 	}),
				// 	this.prismaService.user.groupBy({
				// 		by: ['city'],
				// 		where: { source, ...dateFilter },
				// 		_count: { city: true },
				// 	})
				// ]);


				const byGender = await this.prismaService.user.groupBy({
					by: ['gender'],
					where: { source, ...dateFilter },
					_count: { gender: true },
				});

				const byAge = await this.prismaService.user.groupBy({
					by: ['age'],
					where: { source, ...dateFilter },
					_count: { age: true },
				});

				const byCountry = await this.prismaService.user.groupBy({
					by: ['country'],
					where: { source, ...dateFilter },
					_count: { country: true },
				});

				const byCity = await this.prismaService.user.groupBy({
					by: ['city'],
					where: { source, ...dateFilter },
					_count: { city: true },
				});

				return {
					source,
					totalUsers,
					byGender: Object.fromEntries(
						byGender.map((g) => [g.gender ?? 'unknown', g._count.gender]),
					),
					byAge: Object.fromEntries(
						byAge.map((a) => [String(a.age ?? 'unknown'), a._count.age]),
					),
					byCountry: Object.fromEntries(
						byCountry.map((c) => [c.country ?? 'unknown', c._count.country]),
					),
					byCity: Object.fromEntries(
						byCity.map((c) => [c.city ?? 'unknown', c._count.city]),
					),
				};
			}

			if (source === 'tiktok') {
				const aggregate = await this.prismaService.user.aggregate({
					where: { source, ...dateFilter },
					_avg: { followers: true },
					_min: { followers: true },
					_max: { followers: true },
				});

				return {
					source,
					totalUsers,
					avgFollowers: aggregate._avg.followers ?? 0,
					minFollowers: aggregate._min.followers ?? 0,
					maxFollowers: aggregate._max.followers ?? 0,
				};
			}
		}
		catch (e) {
			console.error('Error creating demographic report:', e);
			throw e;
		}
		finally {
			end();
		}
	}
}
