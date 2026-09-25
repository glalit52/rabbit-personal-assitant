import jwt from "jsonwebtoken";

/**
 * A short-lived, signed token for round-tripping data through a third party we don't
 * control — an OAuth `state` parameter, primarily. Generic and unrelated to sessions:
 * whoever holds the secret can mint and verify these, but the payload shape is the
 * caller's own.
 */
export function signState<T extends object>(payload: T, secret: string, expiresIn: jwt.SignOptions["expiresIn"] = "15m"): string {
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifyState<T>(token: string, secret: string): T {
  return jwt.verify(token, secret) as T;
}
