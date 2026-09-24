import { eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import { evaluateAction, type RateLimiter } from "@agent/policy-engine";
import type { Action, ActionType, TenantPolicy } from "@agent/core";
import { AuditLogger } from "@agent/audit";

export const CHANNEL_TO_ACTION_TYPE: Record<string, ActionType> = {
  email: "send_email",
  whatsapp: "send_whatsapp",
  sms: "send_sms",
  voice: "place_call",
};

export interface ProposeActionInput {
  tenantId: string;
  type: ActionType;
  targetSystem: string;
  payload: Record<string, unknown>;
  rationale?: string;
  triggeringEventId?: string;
  riskLevel?: Action["riskLevel"];
}

/**
 * Proposes an action, runs it through the policy engine, persists the decision, and
 * — only when the decision is ALLOW — marks it executed. Execution itself is a stub
 * (logged, not sent anywhere) until real channel connectors exist; the point of this
 * phase is that nothing reaches a connector without passing through this path.
 */
export async function proposeAndDecideAction(
  db: Database,
  audit: AuditLogger,
  rateLimiter: RateLimiter,
  policy: TenantPolicy,
  input: ProposeActionInput,
) {
  const [inserted] = await db
    .insert(schema.actions)
    .values({
      tenantId: input.tenantId,
      type: input.type,
      targetSystem: input.targetSystem,
      payload: input.payload,
      riskLevel: input.riskLevel ?? "low",
      status: "proposed",
      triggeringEventId: input.triggeringEventId,
      rationale: input.rationale,
    })
    .returning();
  if (!inserted) {
    throw new Error("Failed to propose action");
  }

  await audit.record({
    tenantId: input.tenantId,
    actor: "agent",
    what: "action.proposed",
    why: input.rationale,
    referencedIds: [inserted.id],
  });

  const action = inserted as unknown as Action;
  const evaluation = evaluateAction(action, policy, rateLimiter);

  const [decided] = await db
    .update(schema.actions)
    .set({
      status: evaluation.decision === "ALLOW" ? "executed" : evaluation.decision === "DENY" ? "rejected" : "pending_approval",
      policyDecision: evaluation.decision,
      autonomyLevelApplied: evaluation.autonomyLevelApplied,
      decidedAt: new Date(),
      executedAt: evaluation.decision === "ALLOW" ? new Date() : undefined,
    })
    .where(eq(schema.actions.id, inserted.id))
    .returning();

  await audit.record({
    tenantId: input.tenantId,
    actor: "system",
    what: `policy.${evaluation.decision.toLowerCase()}`,
    why: evaluation.reason,
    referencedIds: [inserted.id],
  });

  if (evaluation.decision === "ALLOW") {
    if (input.targetSystem in CHANNEL_RATE_LIMIT_CHANNELS) {
      rateLimiter.recordSend(input.tenantId, CHANNEL_RATE_LIMIT_CHANNELS[input.targetSystem]!);
    }
    await audit.record({
      tenantId: input.tenantId,
      actor: "agent",
      what: "action.executed",
      why: "Auto-executed under current autonomy level (stub connector, no external call made)",
      referencedIds: [inserted.id],
    });
  }

  return decided;
}

const CHANNEL_RATE_LIMIT_CHANNELS: Record<string, string> = {
  email: "email",
  whatsapp: "whatsapp",
  sms: "sms",
  voice: "voice",
};

export async function approveAction(db: Database, audit: AuditLogger, tenantId: string, actionId: string, userId: string) {
  const [updated] = await db
    .update(schema.actions)
    .set({ status: "executed", approvedByUserId: userId, executedAt: new Date() })
    .where(eq(schema.actions.id, actionId))
    .returning();

  await audit.record({
    tenantId,
    actor: "human",
    actorId: userId,
    what: "action.approved",
    referencedIds: [actionId],
  });

  return updated;
}

export async function rejectAction(db: Database, audit: AuditLogger, tenantId: string, actionId: string, userId: string) {
  const [updated] = await db
    .update(schema.actions)
    .set({ status: "rejected", approvedByUserId: userId, decidedAt: new Date() })
    .where(eq(schema.actions.id, actionId))
    .returning();

  await audit.record({
    tenantId,
    actor: "human",
    actorId: userId,
    what: "action.rejected",
    referencedIds: [actionId],
  });

  return updated;
}

export async function listActions(db: Database, tenantId: string, status?: string) {
  const statusFilter = status && status !== "all" ? status : undefined;
  return db.query.actions.findMany({
    where: (actions, { eq: eqOp, and: andOp }) =>
      statusFilter
        ? andOp(eqOp(actions.tenantId, tenantId), eqOp(actions.status, statusFilter as never))
        : eqOp(actions.tenantId, tenantId),
    orderBy: (actions, { desc }) => desc(actions.createdAt),
    limit: 100,
  });
}
