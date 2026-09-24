import type { AgentEvent, AgentEventType } from "@agent/core";

export type EventHandler<T = Record<string, unknown>> = (event: AgentEvent<T>) => Promise<void> | void;

export type Unsubscribe = () => void;

/**
 * Ingestion gateway → event bus (PRD §5): every inbound message, call end, webhook or
 * schedule tick is published here, at-least-once, keyed by an idempotency key so
 * redelivery of the same event is a no-op for subscribers.
 */
export interface EventBus {
  publish<T = Record<string, unknown>>(event: AgentEvent<T>): Promise<void>;
  subscribe<T = Record<string, unknown>>(type: AgentEventType, handler: EventHandler<T>): Unsubscribe;
  close(): Promise<void>;
}
