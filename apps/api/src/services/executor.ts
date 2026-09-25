import { eq } from "drizzle-orm";
import { schema } from "@agent/db";
import { google, microsoft, whatsapp as whatsappApi, twilio as twilioApi } from "@agent/connectors";
import type { Action } from "@agent/core";
import type { AppContext } from "../context.js";
import { getValidGoogleAccessToken } from "./connectors/google.js";
import { getValidMicrosoftAccessToken } from "./connectors/microsoft.js";
import { getWhatsAppConfig } from "./connectors/whatsapp.js";
import { getTwilioConfig } from "./connectors/twilio.js";
import { findConnectedEmailCalendarProvider } from "./connectors/shared.js";

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
      case "send_sms":
        return await executeSendSms(ctx, action);
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

/**
 * A tenant connects one mail+calendar account at a time for now (PRD's "1 to 3 email
 * accounts" per persona is a later multi-account phase) — whichever of Google or
 * Microsoft is connected handles both mail and calendar actions for that tenant.
 */
async function requireEmailCalendarProvider(ctx: AppContext, tenantId: string): Promise<"google" | "microsoft"> {
  const provider = await findConnectedEmailCalendarProvider(ctx.db, tenantId);
  if (!provider) {
    throw new Error("No connected Google or Microsoft account for this tenant — connect one on the Connectors page");
  }
  return provider;
}

async function executeSendEmail(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as { contactId?: string; draft?: string; to?: string; subject?: string };
  const to = payload.to ?? (payload.contactId ? (await getContact(ctx, payload.contactId)).emails[0] : undefined);
  if (!to) throw new Error("No recipient email address on this action's contact");
  if (!payload.draft) throw new Error("Action has no draft body to send");
  const subject = payload.subject ?? "Re: your message";

  const provider = await requireEmailCalendarProvider(ctx, action.tenantId);
  if (provider === "google") {
    const accessToken = await getValidGoogleAccessToken(ctx.db, requireVault(ctx), action.tenantId);
    const sent = await google.sendGmailMessage(accessToken, { to, subject, bodyText: payload.draft });
    return { success: true, result: { provider, gmailMessageId: sent.id, gmailThreadId: sent.threadId } };
  }
  const accessToken = await getValidMicrosoftAccessToken(ctx.db, requireVault(ctx), action.tenantId);
  await microsoft.sendOutlookMail(accessToken, { to, subject, bodyText: payload.draft });
  return { success: true, result: { provider } };
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

async function executeSendSms(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as { contactId?: string; draft?: string; to?: string };
  const to = payload.to ?? (payload.contactId ? (await getContact(ctx, payload.contactId)).phones[0] : undefined);
  if (!to) throw new Error("No recipient phone number on this action's contact");
  if (!payload.draft) throw new Error("Action has no draft body to send");

  const config = await getTwilioConfig(ctx.db, requireVault(ctx), action.tenantId);
  const sent = await twilioApi.sendSms(config, to, payload.draft);
  return { success: true, result: { twilioMessageSid: sent.sid } };
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

  const provider = await requireEmailCalendarProvider(ctx, action.tenantId);
  const input = {
    summary: payload.summary,
    description: payload.description,
    startIso: payload.startIso,
    endIso: payload.endIso,
    timeZone: payload.timeZone,
    attendeeEmails: payload.attendeeEmails,
  };
  if (provider === "google") {
    const accessToken = await getValidGoogleAccessToken(ctx.db, requireVault(ctx), action.tenantId);
    const event = await google.createCalendarEvent(accessToken, input);
    return { success: true, result: { provider, calendarEventId: event.id, link: event.htmlLink } };
  }
  const accessToken = await getValidMicrosoftAccessToken(ctx.db, requireVault(ctx), action.tenantId);
  const event = await microsoft.createOutlookEvent(accessToken, input);
  return { success: true, result: { provider, calendarEventId: event.id, link: event.webLink } };
}

async function executeRescheduleCalendarEvent(ctx: AppContext, action: Action): Promise<ExecutionResult> {
  const payload = action.payload as { eventId?: string; startIso?: string; endIso?: string; timeZone?: string };
  if (!payload.eventId || !payload.startIso || !payload.endIso) {
    throw new Error("Reschedule action is missing eventId/startIso/endIso");
  }

  const provider = await requireEmailCalendarProvider(ctx, action.tenantId);
  const patch = { startIso: payload.startIso, endIso: payload.endIso, timeZone: payload.timeZone };
  if (provider === "google") {
    const accessToken = await getValidGoogleAccessToken(ctx.db, requireVault(ctx), action.tenantId);
    const event = await google.updateCalendarEvent(accessToken, payload.eventId, patch);
    return { success: true, result: { provider, calendarEventId: event.id, link: event.htmlLink } };
  }
  const accessToken = await getValidMicrosoftAccessToken(ctx.db, requireVault(ctx), action.tenantId);
  const event = await microsoft.updateOutlookEvent(accessToken, payload.eventId, patch);
  return { success: true, result: { provider, calendarEventId: event.id, link: event.webLink } };
}
