import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import type { twilio as twilioApi } from "@agent/connectors";
import type { Vault } from "@agent/secrets";
import { disconnectProvider } from "./shared.js";

export class TwilioNotConnectedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} has no configured Twilio account`);
  }
}

export interface ConfigureTwilioInput {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export async function configureTwilioAccount(db: Database, vault: Vault, tenantId: string, input: ConfigureTwilioInput): Promise<void> {
  await disconnectProvider(db, tenantId, "sms");

  const encrypted = await vault.encrypt({ accountSid: input.accountSid, authToken: input.authToken, fromNumber: input.fromNumber });
  const [credential] = await db
    .insert(schema.credentials)
    .values({ tenantId, provider: "sms", encryptedPayload: encrypted.encryptedPayload, keyId: encrypted.keyId })
    .returning();
  if (!credential) throw new Error("Failed to store Twilio credential");

  await db.insert(schema.identities).values({
    tenantId,
    provider: "sms",
    scopes: [],
    credentialId: credential.id,
    externalAccountId: input.fromNumber,
    health: "connected",
  });
}

export async function getTwilioConfig(db: Database, vault: Vault, tenantId: string): Promise<twilioApi.TwilioConfig> {
  const identity = await db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, "sms")),
  });
  if (!identity?.credentialId) {
    throw new TwilioNotConnectedError(tenantId);
  }
  const credential = await db.query.credentials.findFirst({ where: eq(schema.credentials.id, identity.credentialId) });
  if (!credential) {
    throw new TwilioNotConnectedError(tenantId);
  }
  return (await vault.decrypt({
    encryptedPayload: credential.encryptedPayload,
    keyId: credential.keyId,
  })) as unknown as twilioApi.TwilioConfig;
}

/** Looks up which tenant a Twilio webhook delivery belongs to by the "To" number it targets. */
export async function findTenantIdByTwilioNumber(db: Database, toNumber: string): Promise<string | undefined> {
  const identity = await db.query.identities.findFirst({
    where: and(eq(schema.identities.provider, "sms"), eq(schema.identities.externalAccountId, toNumber)),
  });
  return identity?.tenantId;
}
