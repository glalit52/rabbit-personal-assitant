import { eq } from "drizzle-orm";
import { schema } from "@agent/db";
import type { AgentEvent, TriageLabel } from "@agent/core";
import type { AppContext } from "../context.js";
import { getTenantPolicy } from "./policy.js";
import { CHANNEL_TO_ACTION_TYPE, proposeAndDecideAction } from "./actions.js";
import { extractCommitment } from "./commitments.js";

/**
 * The agent loop for text channels (PRD §5 orchestrator): on every inbound message,
 * triage it, draft a reply in the owner's voice, and hand the proposed reply to the
 * policy engine. This is intentionally the simplest possible version of that loop —
 * one model call to classify, one to draft, no tool use, no memory retrieval yet —
 * so every later phase (RAG, connectors, sub-agents) has a working seam to extend.
 */
export function startOrchestrator(ctx: AppContext): () => void {
  return ctx.eventBus.subscribe<{ messageId: string; threadId: string; contactId: string }>(
    "message.inbound",
    async (event: AgentEvent<{ messageId: string; threadId: string; contactId: string }>) => {
      try {
        await handleInboundMessage(ctx, event);
      } catch (err) {
        console.error("[orchestrator] failed to handle message.inbound", err);
      }
    },
  );
}

async function handleInboundMessage(
  ctx: AppContext,
  event: AgentEvent<{ messageId: string; threadId: string; contactId: string }>,
) {
  const { db } = ctx;
  const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, event.payload.messageId) });
  const thread = await db.query.threads.findFirst({ where: eq(schema.threads.id, event.payload.threadId) });
  if (!message || !thread) return;

  const triageResponse = await ctx.modelRouter.route({
    taskType: "triage_classify",
    tenantId: event.tenantId,
    messages: [
      {
        role: "system",
        content:
          "Classify the message into exactly one label: urgent, needs_reply, fyi, spam, task, invoice, lead, complaint. Reply with only the label.",
      },
      { role: "user", content: message.content },
    ],
    maxTokens: 16,
  });
  const triageLabel = parseTriageLabel(triageResponse.text);

  await db
    .update(schema.threads)
    .set({ triageLabel, updatedAt: new Date() })
    .where(eq(schema.threads.id, thread.id));

  if (triageLabel === "spam") {
    return;
  }

  await extractCommitment(ctx, event.tenantId, message);

  const draftResponse = await ctx.modelRouter.route({
    taskType: "draft_reply",
    tenantId: event.tenantId,
    messages: [
      {
        role: "system",
        content:
          "Draft a short, professional reply to the customer message below, on behalf of the business owner.",
      },
      { role: "user", content: message.content },
    ],
    maxTokens: 300,
  });

  const policy = await getTenantPolicy(db, event.tenantId);
  const actionType = CHANNEL_TO_ACTION_TYPE[thread.channel] ?? "send_email";

  await proposeAndDecideAction(ctx, policy, {
    tenantId: event.tenantId,
    type: actionType,
    targetSystem: thread.channel,
    payload: {
      threadId: thread.id,
      contactId: event.payload.contactId,
      draft: draftResponse.text,
      triageLabel,
    },
    rationale: `Drafted in response to triaged "${triageLabel}" message`,
    triggeringEventId: event.id,
  });
}

const TRIAGE_LABELS: readonly TriageLabel[] = [
  "urgent",
  "needs_reply",
  "fyi",
  "spam",
  "task",
  "invoice",
  "lead",
  "complaint",
];

/**
 * Models (and the no-network mock provider) don't reliably return just the bare
 * label, so this pulls the first known label out of whatever text comes back
 * instead of trusting the response to be exactly one word.
 */
function parseTriageLabel(text: string): TriageLabel {
  const normalized = text.toLowerCase();
  return TRIAGE_LABELS.find((label) => normalized.includes(label)) ?? "needs_reply";
}
