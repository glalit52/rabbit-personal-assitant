import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import type { AgentEvent, AgentEventType } from "@agent/core";
import type { EventBus, EventHandler, Unsubscribe } from "./bus.js";

const QUEUE_PREFIX = "agent-events";

function queueName(type: AgentEventType): string {
  return `${QUEUE_PREFIX}.${type}`;
}

/**
 * Durable, at-least-once event bus backed by Redis (BullMQ). One queue per event
 * type, with automatic retries and a dead-letter-equivalent (failed jobs stay in
 * Redis for inspection). The BullMQ job id is the event's idempotency key, so
 * re-publishing the same event is a safe no-op.
 */
export class RedisEventBus implements EventBus {
  private readonly connection: Redis;
  private readonly queues = new Map<AgentEventType, Queue>();
  private readonly workers: Worker[] = [];

  constructor(redisUrl: string) {
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  }

  private queueFor(type: AgentEventType): Queue {
    let queue = this.queues.get(type);
    if (!queue) {
      queue = new Queue(queueName(type), { connection: this.connection });
      this.queues.set(type, queue);
    }
    return queue;
  }

  async publish<T = Record<string, unknown>>(event: AgentEvent<T>): Promise<void> {
    await this.queueFor(event.type).add(event.type, event, {
      // BullMQ job ids may not contain ":", unlike idempotency keys in general.
      jobId: event.idempotencyKey.replace(/:/g, "_"),
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: false,
    });
  }

  subscribe<T = Record<string, unknown>>(type: AgentEventType, handler: EventHandler<T>): Unsubscribe {
    const worker = new Worker(
      queueName(type),
      async (job: Job<AgentEvent<T>>) => {
        await handler(job.data);
      },
      { connection: this.connection },
    );
    this.workers.push(worker);
    return () => {
      void worker.close();
    };
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection.disconnect();
  }
}
