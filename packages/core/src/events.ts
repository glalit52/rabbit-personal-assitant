/**
 * Everything inbound (a message, a call ending, a schedule tick, a webhook) becomes
 * one of these before the orchestrator ever sees it (PRD §5, ingestion gateway).
 */
export type AgentEventType =
  | "message.inbound"
  | "message.outbound.sent"
  | "call.ended"
  | "action.proposed"
  | "action.decided"
  | "action.executed"
  | "schedule.tick";

export interface AgentEvent<TPayload = Record<string, unknown>> {
  id: string;
  tenantId: string;
  type: AgentEventType;
  /** Caller-supplied key so redelivery of the same event is a no-op (at-least-once delivery). */
  idempotencyKey: string;
  payload: TPayload;
  createdAt: string;
}
