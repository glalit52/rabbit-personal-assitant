import jwt from "jsonwebtoken";
import type { TenantRole } from "@agent/core";

export interface SessionClaims {
  sub: string;
  tenantId: string;
  role: TenantRole;
}

const DEFAULT_TTL: jwt.SignOptions["expiresIn"] = "12h";

export function signSession(
  claims: SessionClaims,
  secret: string,
  expiresIn: jwt.SignOptions["expiresIn"] = DEFAULT_TTL,
): string {
  return jwt.sign(claims, secret, { expiresIn });
}

export function verifySession(token: string, secret: string): SessionClaims {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded === "string") {
    throw new Error("Malformed session token");
  }
  const { sub, tenantId, role } = decoded as Partial<SessionClaims>;
  if (!sub || !tenantId || !role) {
    throw new Error("Malformed session token");
  }
  return { sub, tenantId, role };
}
