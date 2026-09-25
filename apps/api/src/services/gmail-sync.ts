import { eq } from "drizzle-orm";
import { schema } from "@agent/db";
import { google } from "@agent/connectors";
import type { AppContext } from "../context.js";
import { getGoogleIdentity, getValidGoogleAccessToken } from "./connectors/google.js";
import { ingestInboundMessage } from "./ingestion.js";

const BACKFILL_MAX_RESULTS = 15;

/**
 * Polling stand-in for Gmail push notifications (PRD §4 calls for Pub/Sub push;
 * that needs a verified GCP Pub/Sub topic and domain, which is infrastructure to
 * provision, not code to write, so a poll — driven by `POST /connectors/gmail/sync`
 * or a scheduler hitting the same endpoint — is the pragmatic v1). Incremental after
 * the first run: Gmail's history API returns only what changed since the last
 * historyId, so a poll is cheap once the tenant is caught up.
 */
export async function syncGmailInbox(ctx: AppContext, tenantId: string): Promise<{ synced: number; historyId: string }> {
  if (!ctx.vault) {
    throw new Error("VAULT_MASTER_KEY is not configured");
  }
  const identity = await getGoogleIdentity(ctx.db, tenantId);
  if (!identity) {
    throw new Error("No connected Google account for this tenant");
  }
  const accessToken = await getValidGoogleAccessToken(ctx.db, ctx.vault, tenantId);
  const priorHistoryId = (identity.metadata as { historyId?: string } | null)?.historyId;

  let messageIds: string[];
  let nextHistoryId: string;

  if (priorHistoryId) {
    const history = await google.listGmailHistorySinceId(accessToken, priorHistoryId);
    messageIds = history.newMessageIds;
    nextHistoryId = history.historyId;
  } else {
    const [profile, listed] = await Promise.all([
      google.getGmailProfile(accessToken),
      google.listGmailMessageIds(accessToken, { query: "in:inbox", maxResults: BACKFILL_MAX_RESULTS }),
    ]);
    messageIds = listed.ids;
    nextHistoryId = profile.historyId;
  }

  let synced = 0;
  for (const id of messageIds) {
    const message = await google.getGmailMessage(accessToken, id);
    if (message.fromEmail === identity.externalAccountId) {
      continue; // the tenant's own sent mail, not something to triage as inbound
    }
    const displayName = message.from.replace(/<[^>]+>/, "").trim().replace(/^"|"$/g, "");
    const result = await ingestInboundMessage(ctx, {
      tenantId,
      channel: "email",
      contactHandle: message.fromEmail,
      contactName: displayName || undefined,
      content: `Subject: ${message.subject}\n\n${message.bodyText}`,
      providerMessageId: message.id,
    });
    if (!result.duplicate) synced += 1;
  }

  await ctx.db
    .update(schema.identities)
    .set({ metadata: { ...(identity.metadata as Record<string, unknown>), historyId: nextHistoryId }, updatedAt: new Date() })
    .where(eq(schema.identities.id, identity.id));

  return { synced, historyId: nextHistoryId };
}
