import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import {
  connect,
  JetStreamClient,
  MsgHdrsImpl,
  NatsConnection,
  StorageType,
  StringCodec,
} from 'nats'
import { Event } from '@kingo1/universe-assignment-shared'
import { ConfigService } from '@nestjs/config'
import { Logger } from 'nestjs-pino'

@Injectable()
export class NatsService implements OnModuleInit, OnModuleDestroy {
  private nc: NatsConnection
  private sc = StringCodec()
  private js: JetStreamClient

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger
  ) {}

  async onModuleInit() {
    this.nc = await connect({
      servers: `nats://${this.configService.getOrThrow('NATS_URL')}`,
    })

    const jsm = await this.nc.jetstreamManager()

    await jsm.streams.add({
      name: 'FACEBOOK',
      subjects: ['facebook.>'],
      storage: StorageType.File,
    })

    await jsm.streams.add({
      name: 'TIKTOK',
      subjects: ['tiktok.>'],
      storage: StorageType.File,
    })

    this.js = this.nc.jetstream()
    this.logger.log('Connected to NATS')
  }

  async onModuleDestroy() {
    await this.nc.close()
    this.logger.log('Disconnected from NATS')
  }

  async publish(subject: string, message: Event, outboxEventId: string, requestId: string) {
    const msgString = JSON.stringify(message)

    const headers = new MsgHdrsImpl()
    headers.set('outboxEventId', outboxEventId)
    headers.set('requestId', requestId)

    try {
      return await this.js.publish(
        `${subject}.${message.eventType}`,
        this.sc.encode(msgString),
        {
          timeout: 5000,
          headers
        },
      )
    } catch (err) {
      this.logger.error('Failed to publish message:', err, message)
      throw err
    }
  }

  isConnected(): boolean {
    return !!this.nc && !this.nc.isClosed()
  }
}
