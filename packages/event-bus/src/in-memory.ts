import { EventEmitter } from "node:events";
import type { AgentEvent, AgentEventType } from "@agent/core";
import type { EventBus, EventHandler, Unsubscribe } from "./bus.js";

/**
 * Single-process event bus for local development and tests. Not durable — retries,
 * dead-lettering and cross-process delivery need the Redis-backed bus in production.
 */
export class InMemoryEventBus implements EventBus {
  private readonly emitter = new EventEmitter();
  private readonly seenIdempotencyKeys = new Set<string>();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  async publish<T = Record<string, unknown>>(event: AgentEvent<T>): Promise<void> {
    if (this.seenIdempotencyKeys.has(event.idempotencyKey)) {
      return;
    }
    this.seenIdempotencyKeys.add(event.idempotencyKey);
    const handlers = this.emitter.listeners(event.type) as EventHandler<T>[];
    for (const handler of handlers) {
      await handler(event);
    }
  }

  subscribe<T = Record<string, unknown>>(type: AgentEventType, handler: EventHandler<T>): Unsubscribe {
    this.emitter.on(type, handler as EventHandler);
    return () => this.emitter.off(type, handler as EventHandler);
  }

  async close(): Promise<void> {
    this.emitter.removeAllListeners();
  }
}
