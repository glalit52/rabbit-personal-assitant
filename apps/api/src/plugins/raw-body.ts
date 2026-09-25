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
}
