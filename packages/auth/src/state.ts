import jwt from "jsonwebtoken";

/**
 * Short-lived signed token for round-tripping data through a third party we don't
 * control, mainly an OAuth `state` parameter. It is generic and unrelated to
 * sessions. Anyone holding the secret can mint and verify these, but the payload
 * shape belongs to the caller.
 */
export function signState<T extends object>(payload: T, secret: string, expiresIn: jwt.SignOptions["expiresIn"] = "15m"): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyState<T>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}
