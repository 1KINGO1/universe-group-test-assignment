import { Controller, Post, Req, Res } from '@nestjs/common'
import { EventsService } from './events.service'
import { Request, Response } from 'express'

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async processEvent(@Req() req: Request, @Res() res: Response) {
    console.log('Controller: Received new events')
    return this.eventsService.processRequest(req, res)
  }
}
