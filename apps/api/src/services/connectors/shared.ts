import { and, eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";

/** Connecting again replaces whatever was there — one account per provider per tenant for now. */
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

/**
 * A tenant has at most one connected mail+calendar provider at a time (connecting one
 * disconnects the other — see `connectGoogleAccount`/`connectMicrosoftAccount`), so
 * this is really just "which one, if either" rather than a preference order.
 */
export async function findConnectedEmailCalendarProvider(
  db: Database,
  tenantId: string,
): Promise<"google" | "microsoft" | undefined> {
  const google = await db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, "google")),
  });
  if (google) return "google";
  const microsoft = await db.query.identities.findFirst({
    where: and(eq(schema.identities.tenantId, tenantId), eq(schema.identities.provider, "microsoft")),
  });
  return microsoft ? "microsoft" : undefined;
}
