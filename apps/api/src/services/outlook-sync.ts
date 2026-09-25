import { eq } from "drizzle-orm";
import { schema } from "@agent/db";
import { microsoft } from "@agent/connectors";
import type { AppContext } from "../context.js";
import { getMicrosoftIdentity, getValidMicrosoftAccessToken } from "./connectors/microsoft.js";
import { ingestInboundMessage } from "./ingestion.js";

/**
 * Polling stand-in for a Graph change-notification subscription, same rationale as
 * Gmail's sync (PRD §5): a verified public webhook endpoint is infrastructure to
 * provision, not code to write. Microsoft's delta query makes a poll cheap once caught up.
 */
export async function syncOutlookInbox(ctx: AppContext, tenantId: string): Promise<{ synced: number }> {
  if (!ctx.vault) {
    throw new Error("VAULT_MASTER_KEY is not configured");
  }
  const identity = await getMicrosoftIdentity(ctx.db, tenantId);
  if (!identity) {
    throw new Error("No connected Microsoft account for this tenant");
  }
  const accessToken = await getValidMicrosoftAccessToken(ctx.db, ctx.vault, tenantId);
  const priorDeltaLink = (identity.metadata as { deltaLink?: string } | null)?.deltaLink;

  const { messages, deltaLink } = await microsoft.listOutlookInboxDelta(accessToken, priorDeltaLink);

  let synced = 0;
  for (const message of messages) {
    if (!message.fromEmail || message.fromEmail === identity.externalAccountId) {
      continue; // no sender (a draft/system notice) or the tenant's own sent mail
    }
    const result = await ingestInboundMessage(ctx, {
      tenantId,
      channel: "email",
      contactHandle: message.fromEmail,
      contactName: message.fromName || undefined,
      content: `Subject: ${message.subject}\n\n${message.bodyText}`,
      providerMessageId: message.id,
    });
    if (!result.duplicate) synced += 1;
  }

  await ctx.db
    .update(schema.identities)
    .set({ metadata: { ...(identity.metadata as Record<string, unknown>), deltaLink }, updatedAt: new Date() })
    .where(eq(schema.identities.id, identity.id));

  return { synced };
}
