import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AckPolicy, connect, NatsConnection, StringCodec, JsMsg, Timeout } from 'nats';
import { ConfigService } from '@nestjs/config';
import { Event } from '../../types';
import * as pLimit from 'p-limit';
import { Logger } from 'nestjs-pino';

type HandlerFunction = (events: Event[]) => Promise<void>;

@Injectable()
export class NatsConsumerService implements OnModuleInit, OnModuleDestroy {
  private nc: NatsConnection;
  private sc = StringCodec();
  private handlers: HandlerFunction[] = [];
  private running = false;
  private readonly activePromises = new Set<Promise<void>>();
  private limit = pLimit(3);
  private messageBuffer: { msg: JsMsg; data: Event }[] = [];
  private readonly batchSize = 200;
  private readonly batchTimeoutMs = 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: Logger,
  ) {}

  async onModuleInit() {
    this.running = true;
    this.nc = await connect({
      servers: `nats://${this.configService.getOrThrow('NATS_URL')}`,
      maxReconnectAttempts: -1,
    });
    this.logger.log('Connected to NATS');

    const jsm = await this.nc.jetstreamManager();
    const stream = this.configService.getOrThrow('NATS_STREAM');
    const consumer = this.configService.getOrThrow('NATS_CONSUMER');

    try {
      await jsm.consumers.add(stream, {
        name: consumer,
        ack_policy: AckPolicy.Explicit,
        max_deliver: 3,
        ack_wait: 10000,
      });
    } catch (err) {
      if (err.api_error?.err_code === 10148) {
        this.logger.log('Consumer already exists, skipping creation.');
      } else {
        throw err;
      }
    }

    this.startConsuming();
  }

  async onModuleDestroy() {
    this.running = false;
    this.logger.log('Waiting for in-flight batches to finish...');
    await Promise.allSettled(this.activePromises);
    await this.processRemainingBatch();
    await this.nc.close();
    this.logger.log('Disconnected from NATS');
  }

  private async processBatch(messages: { msg: JsMsg; data: Event }[]) {
    if (messages.length === 0) return;

    const promise = this.limit(async () => {
      const start = Date.now();
      const outboxEventIds = messages.map(m => m.msg.headers?.get('outboxEventId') ?? 'unknown');

      try {
        this.logger.log({
          msg: 'Start processing batch',
          batchSize: messages.length,
          outboxEventIds: outboxEventIds.slice(0, 10).join(','),
        });

        const events = messages.map(m => m.data);
        const results = await Promise.all(
          this.handlers.map(async (handler, handlerIndex) => {
            try {
              await handler(events);
              return { success: true, handlerIndex };
            } catch (err) {
              return { success: false, handlerIndex, error: err };
            }
          }),
        );

        const failedHandlers = results.filter(r => !r.success);
        if (failedHandlers.length > 0) {
          this.logger.error({
            msg: 'Some handlers failed',
            failedHandlers: failedHandlers.map(h => ({
              handlerIndex: h.handlerIndex,
              error: h.error.message,
            })),
            batchSize: messages.length,
          });
          await Promise.all(messages.map(m => m.msg.nak()));
          return;
        }

        await Promise.all(messages.map(m => m.msg.ack()));

        const duration = Date.now() - start;
        this.logger.log({
          msg: 'Batch processed successfully',
          batchSize: messages.length,
          durationMs: duration,
          cpuUsage: process.cpuUsage(),
        });
      } catch (err) {
        this.logger.error({
          msg: 'Batch processing failed',
          errorMessage: err.message,
          stack: err.stack,
          batchSize: messages.length,
        });
        await Promise.all(messages.map(m => m.msg.nak()));
      }
    }).finally(() => {
      this.activePromises.delete(promise);
    });

    this.activePromises.add(promise);
  }

  private async startConsuming() {
    const js = this.nc.jetstream();
    const consumer = await js.consumers.get(
      this.configService.getOrThrow('NATS_STREAM'),
      this.configService.getOrThrow('NATS_CONSUMER'),
    );

    const messages = await consumer.consume({ max_messages: 50, expires: 1000 });

    (async () => {
      let batchTimeout: any | null = null;

      for await (const m of messages) {
        if (!this.running) break;

        try {
          const data = JSON.parse(this.sc.decode(m.data));
          this.messageBuffer.push({ msg: m, data });
        } catch (err) {
          this.logger.error({
            msg: 'Failed to parse event',
            error: err.message,
            outboxEventId: m.headers?.get('outboxEventId'),
          });
          await m.nak();
          continue;
        }

        if (this.messageBuffer.length >= this.batchSize) {
          const batch = this.messageBuffer.splice(0, this.batchSize);
          await this.processBatch(batch);
          if (batchTimeout) clearTimeout(batchTimeout);
          batchTimeout = null;
        } else if (!batchTimeout) {
          batchTimeout = setTimeout(async () => {
            const batch = this.messageBuffer.splice(0, this.messageBuffer.length);
            await this.processBatch(batch);
            batchTimeout = null;
          }, this.batchTimeoutMs);
        }
      }
    })();
  }

  private async processRemainingBatch() {
    if (this.messageBuffer.length > 0) {
      const batch = this.messageBuffer.splice(0, this.messageBuffer.length);
      await this.processBatch(batch);
    }
  }

  isConnected(): boolean {
    return !!this.nc && !this.nc.isClosed();
  }

  subscribe(handler: HandlerFunction) {
    this.handlers.push(handler);
  }
}