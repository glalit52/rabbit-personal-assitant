export type AuditActor = "agent" | "human" | "system";

/**
 * Append-only audit trail entry (PRD §9/§10): every action links back to the event,
 * context and rationale that caused it, and to the policy decision + approver.
 */
export interface AuditEvent {
  id: string;
  tenantId: string;
  actor: AuditActor;
  actorId?: string;
  /** Short machine-readable name, e.g. "action.proposed", "action.approved", "policy.denied". */
  what: string;
  /** Human-readable rationale / explanation. */
  why?: string;
  /** Ids of the records (event, action, message, thread) this entry references. */
  referencedIds: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
}
