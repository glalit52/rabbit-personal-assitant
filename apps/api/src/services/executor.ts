import { eq } from "drizzle-orm";
import { schema } from "@agent/db";
import { google, whatsapp as whatsappApi } from "@agent/connectors";
import type { Action } from "@agent/core";
import type { AppContext } from "../context.js";
import { getValidGoogleAccessToken } from "./connectors/google.js";
import { getWhatsAppConfig } from "./connectors/whatsapp.js";

export interface ExecutionResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * The one place a decided action actually reaches an external system. Everything
 * upstream (policy engine, approvals) only ever produces a decision; this is where
 * that decision either does something in the real world or, until a connector for
 * this action type exists, is logged as a no-op so the rest of the pipeline is still
 * fully exercisable (PRD §5 "Tool layer (MCP): typed, scoped, rate-limited connectors").
 */
export async function executeAction(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  try {
    switch (action.type) {
      case "send_email":
        return await executeSendEmail(ctx, action);
      case "send_whatsapp":
        return await executeSendWhatsApp(ctx, action);
      case "book_calendar_event":
        return await executeBookCalendarEvent(ctx, action);
      case "reschedule_calendar_event":
        return await executeRescheduleCalendarEvent(ctx, action);
      default:
        return {
          success: true,
          result: { note: `No connector implemented yet for action type "${action.type}" — logged only` },
        };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function getContact(ctx: AppContext, contactId: string) {
  const contact = await ctx.db.query.contacts.findFirst({ where: eq(schema.contacts.id, contactId) });
  if (!contact) throw new Error(`Contact ${contactId} not found`);
  return contact;
}

function requireVault(ctx: AppContext) {
  if (!ctx.vault) {
    throw new Error("VAULT_MASTER_KEY is not configured — connector credentials cannot be decrypted");
  }
  return ctx.vault;
}

async function executeSendEmail(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as { contactId?: string; draft?: string; to?: string; subject?: string };
  const to = payload.to ?? (payload.contactId ? (await getContact(ctx, payload.contactId)).emails[0] : undefined);
  if (!to) throw new Error("No recipient email address on this action's contact");
  if (!payload.draft) throw new Error("Action has no draft body to send");

  const accessToken = await getValidGoogleAccessToken(ctx.db, requireVault(ctx), action.tenantId);
  const sent = await google.sendGmailMessage(accessToken, {
    to,
    subject: payload.subject ?? "Re: your message",
    bodyText: payload.draft,
  });
  return { success: true, result: { gmailMessageId: sent.id, gmailThreadId: sent.threadId } };
}

async function executeSendWhatsApp(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as { contactId?: string; draft?: string; to?: string };
  const to = payload.to ?? (payload.contactId ? (await getContact(ctx, payload.contactId)).phones[0] : undefined);
  if (!to) throw new Error("No recipient phone number on this action's contact");
  if (!payload.draft) throw new Error("Action has no draft body to send");

  const config = await getWhatsAppConfig(ctx.db, requireVault(ctx), action.tenantId);
  const sent = await whatsappApi.sendWhatsAppText(config, to, payload.draft);
  return { success: true, result: { whatsappMessageId: sent.messages[0]?.id } };
}

async function executeBookCalendarEvent(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as {
    summary?: string;
    description?: string;
    startIso?: string;
    endIso?: string;
    timeZone?: string;
    attendeeEmails?: string[];
  };
  if (!payload.summary || !payload.startIso || !payload.endIso) {
    throw new Error("Calendar event action is missing summary/startIso/endIso");
  }
  const accessToken = await getValidGoogleAccessToken(ctx.db, requireVault(ctx), action.tenantId);
  const event = await google.createCalendarEvent(accessToken, {
    summary: payload.summary,
    description: payload.description,
    startIso: payload.startIso,
    endIso: payload.endIso,
    timeZone: payload.timeZone,
    attendeeEmails: payload.attendeeEmails,
  });
  return { success: true, result: { calendarEventId: event.id, htmlLink: event.htmlLink } };
}

async function executeRescheduleCalendarEvent(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as { eventId?: string; startIso?: string; endIso?: string; timeZone?: string };
  if (!payload.eventId || !payload.startIso || !payload.endIso) {
    throw new Error("Reschedule action is missing eventId/startIso/endIso");
  }
  const accessToken = await getValidGoogleAccessToken(ctx.db, requireVault(ctx), action.tenantId);
  const event = await google.updateCalendarEvent(accessToken, payload.eventId, {
    startIso: payload.startIso,
    endIso: payload.endIso,
    timeZone: payload.timeZone,
  });
  return { success: true, result: { calendarEventId: event.id, htmlLink: event.htmlLink } };
}
