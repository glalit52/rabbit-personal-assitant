import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { verifySession, type SessionClaims } from "@agent/auth";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    session?: SessionClaims;
  }
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    await reply.code(401).send({ error: "Missing bearer token" });
    return;
  }
  try {
    request.session = verifySession(header.slice("Bearer ".length), env.jwtSecret);
  } catch {
    await reply.code(401).send({ error: "Invalid or expired session" });
  }
}

export function requireRole(...roles: SessionClaims["role"][]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.session || !roles.includes(request.session.role)) {
      await reply.code(403).send({ error: "Insufficient role" });
    }
  };
}

export function registerAuthPlugin(app: FastifyInstance): void {
  app.decorateRequest("session", undefined);
}
