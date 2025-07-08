import { Module } from '@nestjs/common';
import { PrismaModule } from '@kingo1/universe-assignment-shared';
import { ReportsModule } from './reports/reports.module';
import {APP_PIPE} from '@nestjs/core';
import { ZodValidationPipe } from 'nestjs-zod';
import {ConfigModule} from '@nestjs/config';

@Module({
  imports: [PrismaModule, ReportsModule, ConfigModule.forRoot({isGlobal: true})],
  providers: [
    {
      provide: APP_PIPE,
      useClass: ZodValidationPipe,
    },
  ],
})
export class AppModule {}
