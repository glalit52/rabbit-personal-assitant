import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta's subscription handshake: GET with hub.mode=subscribe, hub.verify_token,
 * hub.challenge. Returns the challenge to echo back (200, text/plain) when the
 * verify token matches, or null when it doesn't (caller should respond 403).
 */
export function verifyWhatsAppSubscription(
  query: { "hub.mode"?: string; "hub.verify_token"?: string; "hub.challenge"?: string },
  expectedVerifyToken: string,
): string | null {
  if (query["hub.mode"] === "subscribe" && query["hub.verify_token"] === expectedVerifyToken && query["hub.challenge"]) {
    return query["hub.challenge"];
  }
  return null;
}

/**
 * Every webhook delivery is signed with the app secret (PRD §10: verify sender
 * before acting). `rawBody` must be the exact bytes Meta sent — parsing JSON and
 * re-serializing before verifying will not match the signature.
 */
export function verifyWhatsAppSignature(appSecret: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export interface NormalizedWhatsAppMessage {
  phoneNumberId: string;
  wabaId: string;
  from: string;
  contactName?: string;
  messageId: string;
  text: string;
  timestamp: string;
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id: string }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Only text messages become inbound events for now — media/interactive/location
 * message types are left for a later pass (PRD's F4/F5 scope covers text first).
 */
export function parseWhatsAppWebhookPayload(body: unknown): NormalizedWhatsAppMessage[] {
  const payload = body as WhatsAppWebhookPayload;
  const normalized: NormalizedWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const { value } = change;
      const contactsByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const message of value.messages ?? []) {
        if (message.type !== "text" || !message.text) continue;
        normalized.push({
          phoneNumberId: value.metadata?.phone_number_id ?? "",
          wabaId: entry.id,
          from: message.from,
          contactName: contactsByWaId.get(message.from),
          messageId: message.id,
          text: message.text.body,
          timestamp: message.timestamp,
        });
      }
    }
  }
  return normalized;
}
