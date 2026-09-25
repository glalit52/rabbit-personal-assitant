import { eq } from "drizzle-orm";
import { schema } from "@agent/db";
import { evaluateAction } from "@agent/policy-engine";
import type { Action, ActionType, TenantPolicy } from "@agent/core";
import type { AppContext } from "../context.js";
import { executeAction } from "./executor.js";

export const CHANNEL_TO_ACTION_TYPE: Record<string, ActionType> = {
  email: "send_email",
  whatsapp: "send_whatsapp",
  sms: "send_sms",
  voice: "place_call",
};

const CHANNEL_RATE_LIMIT_CHANNELS: Record<string, string> = {
  email: "email",
  whatsapp: "whatsapp",
  sms: "sms",
  voice: "voice",
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
 * — only when the decision is ALLOW — executes it via the connector for its type
 * (`executeAction`). A connector failure marks the action `failed` rather than
 * silently pretending to have sent something.
 */
export async function proposeAndDecideAction(ctx: AppContext, policy: TenantPolicy, input: ProposeActionInput) {
  const { db, auditLogger: audit, rateLimiter } = ctx;

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

  await db
    .update(schema.actions)
    .set({
      status: evaluation.decision === "ALLOW" ? "approved" : evaluation.decision === "DENY" ? "rejected" : "pending_approval",
      policyDecision: evaluation.decision,
      autonomyLevelApplied: evaluation.autonomyLevelApplied,
      decidedAt: new Date(),
    })
    .where(eq(schema.actions.id, inserted.id));

  await audit.record({
    tenantId: input.tenantId,
    actor: "system",
    what: `policy.${evaluation.decision.toLowerCase()}`,
    why: evaluation.reason,
    referencedIds: [inserted.id],
  });

  if (evaluation.decision !== "ALLOW") {
    return db.query.actions.findFirst({ where: eq(schema.actions.id, inserted.id) });
  }

  if (input.targetSystem in CHANNEL_RATE_LIMIT_CHANNELS) {
    rateLimiter.recordSend(input.tenantId, CHANNEL_RATE_LIMIT_CHANNELS[input.targetSystem]!);
  }
  return runAndRecordExecution(ctx, { ...action, autonomyLevelApplied: evaluation.autonomyLevelApplied }, "agent");
}

/** Shared by auto-ALLOW and human approval: run the connector, persist the outcome, audit it either way. */
async function runAndRecordExecution(ctx: AppContext, action: Action, actor: "agent" | "human", actorId?: string) {
  const { db, auditLogger: audit } = ctx;
  const execution = await executeAction(ctx, action);

  const [updated] = await db
    .update(schema.actions)
    .set({
      status: execution.success ? "executed" : "failed",
      result: execution.success ? (execution.result ?? {}) : { error: execution.error },
      executedAt: execution.success ? new Date() : undefined,
    })
    .where(eq(schema.actions.id, action.id))
    .returning();

  await audit.record({
    tenantId: action.tenantId,
    actor,
    actorId,
    what: execution.success ? "action.executed" : "action.execution_failed",
    why: execution.success ? undefined : execution.error,
    referencedIds: [action.id],
    metadata: execution.result,
  });

  return updated;
}

export async function approveAction(ctx: AppContext, tenantId: string, actionId: string, userId: string) {
  const action = await ctx.db.query.actions.findFirst({ where: eq(schema.actions.id, actionId) });
  if (!action) return undefined;

  await ctx.db
    .update(schema.actions)
    .set({ approvedByUserId: userId })
    .where(eq(schema.actions.id, actionId));

  await ctx.auditLogger.record({ tenantId, actor: "human", actorId: userId, what: "action.approved", referencedIds: [actionId] });

  return runAndRecordExecution(ctx, action as unknown as Action, "human", userId);
}

export async function rejectAction(ctx: AppContext, tenantId: string, actionId: string, userId: string) {
  const [updated] = await ctx.db
    .update(schema.actions)
    .set({ status: "rejected", approvedByUserId: userId, decidedAt: new Date() })
    .where(eq(schema.actions.id, actionId))
    .returning();

  await ctx.auditLogger.record({ tenantId, actor: "human", actorId: userId, what: "action.rejected", referencedIds: [actionId] });

  return updated;
}

export async function listActions(ctx: AppContext, tenantId: string, status?: string) {
  const statusFilter = status && status !== "all" ? status : undefined;
  return ctx.db.query.actions.findMany({
    where: (actions, { eq: eqOp, and: andOp }) =>
      statusFilter
        ? andOp(eqOp(actions.tenantId, tenantId), eqOp(actions.status, statusFilter as never))
        : eqOp(actions.tenantId, tenantId),
    orderBy: (actions, { desc }) => desc(actions.createdAt),
    limit: 100,
  });
}
