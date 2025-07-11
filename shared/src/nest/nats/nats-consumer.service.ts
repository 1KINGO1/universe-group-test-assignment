import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { AckPolicy, connect, NatsConnection, StringCodec, JsMsg } from 'nats'
import { ConfigService } from '@nestjs/config'
import { Event } from '../../types'
import * as pLimit from 'p-limit'

type HandlerFunction = (data: Event) => Promise<void>

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private nc: NatsConnection
  private sc = StringCodec()
  private handlers: HandlerFunction[] = []
  private running = false
  private readonly activePromises = new Set<Promise<void>>()
  private limit = pLimit(20)

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    this.running = true
    this.nc = await connect({
      servers: `nats://${this.configService.getOrThrow('NATS_URL')}`,
    })
    console.log('Connected to NATS')

    const jsm = await this.nc.jetstreamManager()
    const stream = this.configService.getOrThrow('NATS_STREAM')
    const consumer = this.configService.getOrThrow('NATS_CONSUMER')

    try {
      await jsm.consumers.add(stream, {
        name: consumer,
        ack_policy: AckPolicy.Explicit,
      })
    } catch (err) {
      if (err.api_error?.err_code === 10148) {
        console.log('Consumer already exists, skipping creation.')
      } else {
        throw err
      }
    }

    this.startConsuming()
  }

  async onModuleDestroy() {
    this.running = false
    console.log('Waiting for in-flight events to finish...')
    await Promise.allSettled(this.activePromises)
    await this.nc.close()
    console.log('Disconnected from NATS')
  }

  private async startConsuming() {
    const js = this.nc.jetstream()
    const consumer = await js.consumers.get(
      this.configService.getOrThrow('NATS_STREAM'),
      this.configService.getOrThrow('NATS_CONSUMER'),
    )

    const messages = await consumer.consume()

    ;(async () => {
      for await (const m of messages) {
        if (!this.running) break

        const promise = this.limit(async () => {
          const data = JSON.parse(this.sc.decode(m.data))
          await Promise.all(this.handlers.map(handler => handler(data)))
          await m.ack()
        })
          .catch(err => {
            console.error('Handler error:', err)
            m.nak()
          })
          .finally(() => {
            this.activePromises.delete(promise)
          })

        this.activePromises.add(promise)
      }
    })()
  }

  isConnected(): boolean {
    return !!this.nc && !this.nc.isClosed()
  }

  subscribe(handler: HandlerFunction) {
    this.handlers.push(handler)
  }
}
