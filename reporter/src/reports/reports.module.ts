import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import {MetricsModule} from '../metrics/metrics.module';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  imports: [MetricsModule]
})
export class ReportsModule {}
