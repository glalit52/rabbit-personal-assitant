import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import { google } from "@agent/connectors";
import type { Vault } from "@agent/secrets";
import { env } from "../../env.js";

export class GoogleNotConnectedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} has no connected Google account`);
  }
}

function requireGoogleConfig() {
  const config = env.google;
  if (!config) {
    throw new Error(
      "Google OAuth is not configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README for setup steps)",
    );
  }
  return config;
}

export async function connectGoogleAccount(db: Database, vault: Vault, tenantId: string, code: string): Promise<{ email: string }> {
  const config = requireGoogleConfig();
  const tokenSet = await google.exchangeGoogleAuthCode(config, code);
  const email = await google.fetchGoogleEmail(tokenSet.accessToken);

  await disconnectProvider(db, tenantId, "google");

  const encrypted = await vault.encrypt({ ...tokenSet });
  const [credential] = await db
    .insert(schema.credentials)
    .values({ tenantId, provider: "google", encryptedPayload: encrypted.encryptedPayload, keyId: encrypted.keyId })
    .returning();
  if (!credential) throw new Error("Failed to store Google credential");

  await db.insert(schema.identities).values({
    tenantId,
    provider: "google",
    scopes: google.GOOGLE_SCOPES,
    credentialId: credential.id,
    externalAccountId: email,
    health: "connected",
  });

  return { email };
}

export async function getGoogleIdentity(db: Database, tenantId: string) {
  return db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, "google")),
  });
}

/** Returns a live access token, transparently refreshing and re-persisting it if it's about to expire. */
export async function getValidGoogleAccessToken(db: Database, vault: Vault, tenantId: string): Promise<string> {
  const identity = await getGoogleIdentity(db, tenantId);
  if (!identity?.credentialId) {
    throw new GoogleNotConnectedError(tenantId);
  }
  const credential = await db.query.credentials.findFirst({ where: eq(schema.credentials.id, identity.credentialId) });
  if (!credential) {
    throw new GoogleNotConnectedError(tenantId);
  }

  const tokenSet = (await vault.decrypt({
    encryptedPayload: credential.encryptedPayload,
    keyId: credential.keyId,
  })) as unknown as google.GoogleTokenSet;

  if (!google.isExpiringSoon(tokenSet)) {
    return tokenSet.accessToken;
  }

  const config = requireGoogleConfig();
  try {
    const refreshed = await google.refreshGoogleAccessToken(config, tokenSet.refreshToken);
    const nextTokenSet: google.GoogleTokenSet = { ...tokenSet, ...refreshed };
    const encrypted = await vault.encrypt({ ...nextTokenSet });
    await db
      .update(schema.credentials)
      .set({ encryptedPayload: encrypted.encryptedPayload, keyId: encrypted.keyId })
      .where(eq(schema.credentials.id, credential.id));
    await db.update(schema.identities).set({ updatedAt: new Date(), health: "connected" }).where(eq(schema.identities.id, identity.id));
    return nextTokenSet.accessToken;
  } catch (err) {
    await db.update(schema.identities).set({ health: "expired", updatedAt: new Date() }).where(eq(schema.identities.id, identity.id));
    throw err;
  }
}

export async function disconnectProvider(db: Database, tenantId: string, provider: string): Promise<void> {
  const existing = await db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, provider)),
  });
  if (!existing) return;
  await db.delete(schema.identities).where(eq(schema.identities.id, existing.id));
  if (existing.credentialId) {
    await db.delete(schema.credentials).where(eq(schema.credentials.id, existing.credentialId));
  }
}
