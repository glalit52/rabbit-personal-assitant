import { and, eq, lte, isNotNull } from "drizzle-orm";
import { schema } from "@agent/db";
import type { AppContext } from "../context.js";
import { CHANNEL_TO_ACTION_TYPE, proposeAndDecideAction } from "./actions.js";
import { getTenantPolicy } from "./policy.js";

const CHASE_INTERVAL_MS = 48 * 60 * 60 * 1000; // "follows up once [...] after 48 hours" (PRD §3 example flow)

interface ExtractedCommitment {
  hasCommitment: boolean;
  description?: string;
  dueDate?: string | null;
}

/**
 * One model call per inbound message, looking for something the sender is now
 * waiting on — a promise, a deadline, an ask that needs a reply (PRD F9). Most
 * messages have none; this is deliberately cheap (fast tier, tiny output) since it
 * runs on every message, not just ones that end up mattering.
 */
function parseExtraction(text: string): ExtractedCommitment {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { hasCommitment: false };
  try {
    const parsed = JSON.parse(match[0]) as ExtractedCommitment;
    return { hasCommitment: Boolean(parsed.hasCommitment), description: parsed.description, dueDate: parsed.dueDate };
  } catch {
    return { hasCommitment: false };
  }
}

export async function extractCommitment(
  ctx: AppContext,
  tenantId: string,
  message: { id: string; content: string },
): Promise<void> {
  const response = await ctx.modelRouter.route({
    taskType: "extract_commitment",
    tenantId,
    messages: [
      {
        role: "system",
        content:
          'Does this message contain a commitment, promise, deadline, or something the sender is now waiting on a reply or action for? Respond with ONLY JSON, no other text: {"hasCommitment": boolean, "description": "short summary, present tense", "dueDate": "YYYY-MM-DD or null"}.',
      },
      { role: "user", content: message.content },
    ],
    maxTokens: 150,
  });

  const extracted = parseExtraction(response.text);
  if (!extracted.hasCommitment || !extracted.description) {
    return;
  }

  const dueAt = extracted.dueDate && !Number.isNaN(Date.parse(extracted.dueDate)) ? new Date(extracted.dueDate) : undefined;

  const [commitment] = await ctx.db
    .insert(schema.commitments)
    .values({
      tenantId,
      sourceMessageId: message.id,
      description: extracted.description,
      dueAt,
      status: "open",
      nextChaseAt: dueAt,
    })
    .returning();

  if (commitment) {
    await ctx.auditLogger.record({
      tenantId,
      actor: "agent",
      what: "commitment.created",
      why: extracted.description,
      referencedIds: [commitment.id, message.id],
    });
  }
}

export async function listCommitments(ctx: AppContext, tenantId: string, status?: string) {
  const rows = await ctx.db.query.commitments.findMany({
    where: (commitments, { eq: eqOp, and: andOp }) =>
      status ? andOp(eqOp(commitments.tenantId, tenantId), eqOp(commitments.status, status as never)) : eqOp(commitments.tenantId, tenantId),
    orderBy: (commitments, { asc }) => asc(commitments.dueAt),
    limit: 100,
  });
  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    overdue: row.status === "open" && Boolean(row.dueAt) && row.dueAt!.getTime() < now,
  }));
}

/**
 * Every commitment whose due date has passed and hasn't been chased since — proposes
 * one follow-up action through the normal policy-engine path (PRD's own example: "If
 * there is no reply in 48 hours, it follows up once"). Meant to be called on a
 * schedule; there's no in-process cron here (see README), so it's exposed as an
 * endpoint a scheduler or an operator can hit.
 */
export async function chaseOverdueCommitments(ctx: AppContext, tenantId: string): Promise<{ chased: number }> {
  const now = new Date();
  const due = await ctx.db.query.commitments.findMany({
    where: and(
      eq(schema.commitments.tenantId, tenantId),
      eq(schema.commitments.status, "open"),
      isNotNull(schema.commitments.nextChaseAt),
      lte(schema.commitments.nextChaseAt, now),
    ),
  });

  let chased = 0;
  for (const commitment of due) {
    const didChase = await chaseCommitment(ctx, tenantId, commitment.id);
    if (didChase) chased += 1;
  }
  return { chased };
}

export async function chaseCommitment(ctx: AppContext, tenantId: string, commitmentId: string): Promise<boolean> {
  const commitment = await ctx.db.query.commitments.findFirst({ where: eq(schema.commitments.id, commitmentId) });
  if (!commitment || !commitment.sourceMessageId) return false;

  const message = await ctx.db.query.messages.findFirst({ where: eq(schema.messages.id, commitment.sourceMessageId) });
  if (!message) return false;
  const thread = await ctx.db.query.threads.findFirst({ where: eq(schema.threads.id, message.threadId) });
  if (!thread) return false;
  const contactId = thread.participantContactIds[0];

  const policy = await getTenantPolicy(ctx.db, tenantId);
  await proposeAndDecideAction(ctx, policy, {
    tenantId,
    type: CHANNEL_TO_ACTION_TYPE[thread.channel] ?? "send_email",
    targetSystem: thread.channel,
    payload: {
      threadId: thread.id,
      contactId,
      draft: `Following up on: ${commitment.description}. Just checking in — is there any update?`,
    },
    rationale: `Automatic follow-up: "${commitment.description}" is overdue`,
  });

  await ctx.db
    .update(schema.commitments)
    .set({ nextChaseAt: null, status: "overdue" })
    .where(eq(schema.commitments.id, commitmentId));

  await ctx.auditLogger.record({
    tenantId,
    actor: "agent",
    what: "commitment.chased",
    why: commitment.description,
    referencedIds: [commitmentId],
  });

  return true;
}
