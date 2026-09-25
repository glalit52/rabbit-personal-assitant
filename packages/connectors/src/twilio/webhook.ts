import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio's request-validation algorithm: HMAC-SHA1(authToken, url + sorted param
 * key+value pairs concatenated with no separator), base64-encoded (PRD §10, sender
 * verification). `url` must be the exact webhook URL configured in the Twilio
 * console, including query string if any — a mismatched scheme or trailing slash
 * produces a different signature than the one Twilio sent.
 */
export function verifyTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader) return false;
  const data = url + Object.keys(params).sort().map((key) => key + params[key]).join("");
  const expected = createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");
  const providedBuf = Buffer.from(signatureHeader, "base64");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export interface NormalizedInboundSms {
  from: string;
  to: string;
  body: string;
  messageSid: string;
}

export function parseTwilioInboundSms(params: Record<string, string>): NormalizedInboundSms | undefined {
  if (!params.From || !params.To || !params.MessageSid) {
    return undefined;
  }
  return { from: params.From, to: params.To, body: params.Body ?? "", messageSid: params.MessageSid };
}
