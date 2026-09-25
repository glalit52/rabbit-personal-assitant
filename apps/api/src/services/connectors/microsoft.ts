import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import { microsoft } from "@agent/connectors";
import type { Vault } from "@agent/secrets";
import { env } from "../../env.js";
import { disconnectProvider } from "./shared.js";

export class MicrosoftNotConnectedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} has no connected Microsoft account`);
  }
}

function requireMicrosoftConfig() {
  const config = env.microsoft;
  if (!config) {
    throw new Error(
      "Microsoft OAuth is not configured — set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (see README for setup steps)",
    );
  }
  return config;
}

export async function connectMicrosoftAccount(
  db: Database,
  vault: Vault,
  tenantId: string,
  code: string,
): Promise<{ email: string }> {
  const config = requireMicrosoftConfig();
  const tokenSet = await microsoft.exchangeMicrosoftAuthCode(config, code);
  const email = await microsoft.fetchMicrosoftEmail(tokenSet.accessToken);

  await disconnectProvider(db, tenantId, "microsoft");
  await disconnectProvider(db, tenantId, "google");

  const encrypted = await vault.encrypt({ ...tokenSet });
  const [credential] = await db
    .insert(schema.credentials)
    .values({ tenantId, provider: "microsoft", encryptedPayload: encrypted.encryptedPayload, keyId: encrypted.keyId })
    .returning();
  if (!credential) throw new Error("Failed to store Microsoft credential");

  await db.insert(schema.identities).values({
    tenantId,
    provider: "microsoft",
    scopes: microsoft.MICROSOFT_SCOPES,
    credentialId: credential.id,
    externalAccountId: email,
    health: "connected",
  });

  return { email };
}

export async function getMicrosoftIdentity(db: Database, tenantId: string) {
  return db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, "microsoft")),
  });
}

export async function getValidMicrosoftAccessToken(db: Database, vault: Vault, tenantId: string): Promise<string> {
  const identity = await getMicrosoftIdentity(db, tenantId);
  if (!identity?.credentialId) {
    throw new MicrosoftNotConnectedError(tenantId);
  }
  const credential = await db.query.credentials.findFirst({ where: eq(schema.credentials.id, identity.credentialId) });
  if (!credential) {
    throw new MicrosoftNotConnectedError(tenantId);
  }

  const tokenSet = (await vault.decrypt({
    encryptedPayload: credential.encryptedPayload,
    keyId: credential.keyId,
  })) as unknown as microsoft.MicrosoftTokenSet;

  if (!microsoft.isExpiringSoon(tokenSet)) {
    return tokenSet.accessToken;
  }

  const config = requireMicrosoftConfig();
  try {
    const refreshed = await microsoft.refreshMicrosoftAccessToken(config, tokenSet.refreshToken);
    const nextTokenSet: microsoft.MicrosoftTokenSet = { ...tokenSet, ...refreshed };
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
