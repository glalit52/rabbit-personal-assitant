import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** The exact bytes of the request body, captured before JSON parsing — needed to verify webhook HMAC signatures. */
    rawBody?: Buffer;
  }
}

/**
 * Signature verification (WhatsApp's X-Hub-Signature-256) is computed over the exact
 * bytes a webhook sender transmitted. Re-serializing the parsed JSON before hashing
 * would produce a different signature whenever key order or whitespace differs, so
 * the raw buffer has to be captured on the way in.
 */
export function registerRawBodyPlugin(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, rawBody, done) => {
    const body = rawBody as Buffer;
    request.rawBody = body;
    if (body.length === 0) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body.toString("utf8")));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // Twilio posts webhooks as form-urlencoded; its signature is computed over the
  // parsed key/value pairs (not the raw bytes), so a flat object is all that's needed.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string" },
    (_request, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );
}
