import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@agent/db";
import type { AgentEvent, Channel } from "@agent/core";
import type { AppContext } from "../context.js";

export interface InboundMessageInput {
  tenantId: string;
  channel: Channel;
  contactHandle: string;
  contactName?: string;
  content: string;
}

/**
 * Ingestion gateway stand-in (PRD §5): normalizes an inbound message to one contact
 * and one thread, then publishes it to the event bus for the orchestrator to pick up.
 * A real deployment has one adapter per provider (Gmail push, WhatsApp webhook, ...)
 * doing the same normalization before calling this.
 */
export async function ingestInboundMessage(ctx: AppContext, input: InboundMessageInput) {
  const { db } = ctx;

  let contact = await db.query.contacts.findFirst({
    where: and(
      eq(schema.contacts.tenantId, input.tenantId),
      sql`${schema.contacts.handles} @> ${JSON.stringify([input.contactHandle])}::jsonb`,
    ),
  });

  if (!contact) {
    const [created] = await db
      .insert(schema.contacts)
      .values({
        tenantId: input.tenantId,
        names: input.contactName ? [input.contactName] : [],
        handles: [input.contactHandle],
      })
      .returning();
    contact = created;
  }
  if (!contact) {
    throw new Error("Failed to resolve contact");
  }

  let thread = await db.query.threads.findFirst({
    where: and(
      eq(schema.threads.tenantId, input.tenantId),
      eq(schema.threads.channel, input.channel),
      sql`${schema.threads.participantContactIds} @> ${JSON.stringify([contact.id])}::jsonb`,
      eq(schema.threads.status, "open"),
    ),
  });

  if (!thread) {
    const [created] = await db
      .insert(schema.threads)
      .values({
        tenantId: input.tenantId,
        channel: input.channel,
        participantContactIds: [contact.id],
        status: "open",
      })
      .returning();
    thread = created;
  }
  if (!thread) {
    throw new Error("Failed to resolve thread");
  }

  const [message] = await db
    .insert(schema.messages)
    .values({
      tenantId: input.tenantId,
      threadId: thread.id,
      direction: "inbound",
      content: input.content,
    })
    .returning();
  if (!message) {
    throw new Error("Failed to store message");
  }

  const event: AgentEvent<{ messageId: string; threadId: string; contactId: string }> = {
    id: randomUUID(),
    tenantId: input.tenantId,
    type: "message.inbound",
    idempotencyKey: `message.inbound:${message.id}`,
    payload: { messageId: message.id, threadId: thread.id, contactId: contact.id },
    createdAt: new Date().toISOString(),
  };
  await ctx.eventBus.publish(event);

  return { contact, thread, message };
}
