import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import type { whatsapp as whatsappApi } from "@agent/connectors";
import type { Vault } from "@agent/secrets";
import { disconnectProvider } from "./google.js";

export class WhatsAppNotConnectedError extends Error {
  constructor(tenantId: string) {
    super(`Tenant ${tenantId} has no configured WhatsApp Business account`);
  }
}

export interface ConfigureWhatsAppInput {
  phoneNumberId: string;
  accessToken: string;
  wabaId: string;
}

/**
 * There's no per-tenant OAuth flow for WhatsApp Business the way there is for Google —
 * onboarding a number requires the owner to go through Meta's Embedded Signup (or
 * WhatsApp Manager) themselves first and hand us the resulting phone_number_id and a
 * permanent access token (PRD §4: "Meta Cloud API via Meta directly or a BSP").
 */
export async function configureWhatsAppAccount(db: Database, vault: Vault, tenantId: string, input: ConfigureWhatsAppInput): Promise<void> {
  await disconnectProvider(db, tenantId, "whatsapp_business");

  const encrypted = await vault.encrypt({ phoneNumberId: input.phoneNumberId, accessToken: input.accessToken });
  const [credential] = await db
    .insert(schema.credentials)
    .values({ tenantId, provider: "whatsapp_business", encryptedPayload: encrypted.encryptedPayload, keyId: encrypted.keyId })
    .returning();
  if (!credential) throw new Error("Failed to store WhatsApp credential");

  await db.insert(schema.identities).values({
    tenantId,
    provider: "whatsapp_business",
    scopes: [],
    credentialId: credential.id,
    externalAccountId: input.phoneNumberId,
    metadata: { wabaId: input.wabaId },
    health: "connected",
  });
}

export async function getWhatsAppConfig(db: Database, vault: Vault, tenantId: string): Promise<whatsappApi.WhatsAppConfig> {
  const identity = await db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, "whatsapp_business")),
  });
  if (!identity?.credentialId) {
    throw new WhatsAppNotConnectedError(tenantId);
  }
  const credential = await db.query.credentials.findFirst({ where: eq(schema.credentials.id, identity.credentialId) });
  if (!credential) {
    throw new WhatsAppNotConnectedError(tenantId);
  }
  return (await vault.decrypt({
    encryptedPayload: credential.encryptedPayload,
    keyId: credential.keyId,
  })) as unknown as whatsappApi.WhatsAppConfig;
}

/** Looks up which tenant a webhook delivery belongs to by the WhatsApp phone_number_id it targets. */
export async function findTenantIdByWhatsAppPhoneNumberId(db: Database, phoneNumberId: string): Promise<string | undefined> {
  const identity = await db.query.identities.findFirst({
    where: and(eq(schema.identities.provider, "whatsapp_business"), eq(schema.identities.externalAccountId, phoneNumberId)),
  });
  return identity?.tenantId;
}
