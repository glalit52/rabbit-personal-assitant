import type { AutonomyLevel } from "./autonomy.js";

/**
 * Every effect the Agent can have on the outside world goes through one of these
 * types, so the policy engine has a fixed, closed vocabulary to reason about.
 * An action type not in this list is unknown and therefore denied by default.
 */
export type ActionType =
  | "send_email"
  | "send_whatsapp"
  | "send_sms"
  | "place_call"
  | "book_calendar_event"
  | "reschedule_calendar_event"
  | "create_crm_record"
  | "update_crm_record"
  | "create_invoice"
  | "initiate_payment"
  | "update_bank_details"
  | "create_task"
  | "bulk_send";

export const ACTION_TYPES: readonly ActionType[] = [
  "send_email",
  "send_whatsapp",
  "send_sms",
  "place_call",
  "book_calendar_event",
  "reschedule_calendar_event",
  "create_crm_record",
  "update_crm_record",
  "create_invoice",
  "initiate_payment",
  "update_bank_details",
  "create_task",
  "bulk_send",
];

export type RiskLevel = "low" | "medium" | "high";

export type PolicyDecision = "ALLOW" | "NEEDS_APPROVAL" | "DENY";

export type ActionStatus =
  | "proposed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "failed"
  | "undone";

/**
 * A proposed effect on the world, before and after the policy engine has ruled on it.
 * Mirrors the "Action" entity in PRD §8.
 */
export interface Action {
  id: string;
  tenantId: string;
  type: ActionType;
  /** External system this action targets, e.g. "whatsapp", "quickbooks". */
  targetSystem: string;
  /** Opaque, connector-specific payload (message body, invoice line items, ...). */
  payload: Record<string, unknown>;
  riskLevel: RiskLevel;
  status: ActionStatus;
  /** What triggered this action: an event id (message, call, schedule tick). */
  triggeringEventId?: string;
  /** The model's own stated reason for proposing this action (for audit + explainability). */
  rationale?: string;
  policyDecision?: PolicyDecision;
  /** The autonomy level in effect for this action type at decision time. */
  autonomyLevelApplied?: AutonomyLevel;
  approvedByUserId?: string;
  result?: Record<string, unknown>;
  /** Opaque handle a connector can use to reverse this action, if reversible. */
  undoHandle?: string;
  createdAt: string;
  decidedAt?: string;
  executedAt?: string;
}
