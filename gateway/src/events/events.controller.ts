import { Controller, Post, Req, Res } from '@nestjs/common'
import { EventsService } from './events.service'
import { Request, Response } from 'express'
import { Logger } from 'nestjs-pino'

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly logger: Logger,
  ) {}

  @Post()
  async processEvent(@Req() req: Request, @Res() res: Response) {
    return this.eventsService.processRequest(req, res)
  }
}
