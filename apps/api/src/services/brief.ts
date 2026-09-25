import { and, eq, gte, desc, inArray } from "drizzle-orm";
import { schema } from "@agent/db";
import type { AppContext } from "../context.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DailyBrief {
  generatedAt: string;
  pendingApprovalsCount: number;
  pendingApprovals: (typeof schema.actions.$inferSelect)[];
  executedLast24h: number;
  failedLast24h: number;
  newThreadsLast24h: number;
  overdueCommitments: (typeof schema.commitments.$inferSelect)[];
  recentActivity: (typeof schema.auditEvents.$inferSelect)[];
}

/**
 * "Morning summary, end-of-day report of what was handled, what is waiting, and
 * risks" (PRD F13). No scheduler runs this automatically yet (see README) — it's a
 * live snapshot computed on request, which is also what a scheduled job would call.
 */
export async function getDailyBrief(ctx: AppContext, tenantId: string): Promise<DailyBrief> {
  const since = new Date(Date.now() - DAY_MS);

  const [pendingApprovals, executed, failed, newThreads, overdueCommitments, recentActivity] = await Promise.all([
    ctx.db.query.actions.findMany({
      where: and(eq(schema.actions.tenantId, tenantId), eq(schema.actions.status, "pending_approval")),
      orderBy: desc(schema.actions.createdAt),
      limit: 10,
    }),
    ctx.db.query.actions.findMany({
      where: and(eq(schema.actions.tenantId, tenantId), eq(schema.actions.status, "executed"), gte(schema.actions.createdAt, since)),
    }),
    ctx.db.query.actions.findMany({
      where: and(eq(schema.actions.tenantId, tenantId), eq(schema.actions.status, "failed"), gte(schema.actions.createdAt, since)),
    }),
    ctx.db.query.threads.findMany({
      where: and(eq(schema.threads.tenantId, tenantId), gte(schema.threads.createdAt, since)),
    }),
    ctx.db.query.commitments.findMany({
      // "overdue" is not resolved — a commitment that's already been chased once should
      // keep showing up as a risk until it's actually done or cancelled.
      where: and(eq(schema.commitments.tenantId, tenantId), inArray(schema.commitments.status, ["open", "overdue"])),
    }),
    ctx.db.query.auditEvents.findMany({
      where: eq(schema.auditEvents.tenantId, tenantId),
      orderBy: desc(schema.auditEvents.createdAt),
      limit: 15,
    }),
  ]);

  const now = Date.now();
  return {
    generatedAt: new Date().toISOString(),
    pendingApprovalsCount: pendingApprovals.length,
    pendingApprovals,
    executedLast24h: executed.length,
    failedLast24h: failed.length,
    newThreadsLast24h: newThreads.length,
    overdueCommitments: overdueCommitments.filter((c) => c.dueAt && c.dueAt.getTime() < now),
    recentActivity,
  };
}
