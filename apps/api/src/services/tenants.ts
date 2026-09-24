import { eq } from "drizzle-orm";
import { schema, type Database } from "@agent/db";
import { hashPassword, verifyPassword, signSession } from "@agent/auth";
import { defaultTenantPolicy, type TenantType } from "@agent/core";
import { env } from "../env.js";

export interface SignupInput {
  tenantName: string;
  tenantType: TenantType;
  email: string;
  password: string;
}

export async function signup(db: Database, input: SignupInput) {
  const existing = await db.query.tenantUsers.findFirst({ where: eq(schema.tenantUsers.email, input.email) });
  if (existing) {
    throw new Error("An account with this email already exists");
  }

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: input.tenantName, type: input.tenantType })
    .returning();
  if (!tenant) {
    throw new Error("Failed to create tenant");
  }

  const passwordHash = await hashPassword(input.password);
  const [user] = await db
    .insert(schema.tenantUsers)
    .values({ tenantId: tenant.id, email: input.email, passwordHash, role: "owner" })
    .returning();
  if (!user) {
    throw new Error("Failed to create tenant user");
  }

  const policy = defaultTenantPolicy(tenant.id);
  await db.insert(schema.tenantPolicies).values({
    tenantId: tenant.id,
    autonomyByActionType: policy.autonomyByActionType,
    guardrails: policy.guardrails,
    killSwitchEngaged: policy.killSwitchEngaged,
  });

  const token = signSession({ sub: user.id, tenantId: tenant.id, role: user.role }, env.jwtSecret);
  return { token, tenant, user };
}

export async function login(db: Database, email: string, password: string) {
  const user = await db.query.tenantUsers.findFirst({ where: eq(schema.tenantUsers.email, email) });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  const token = signSession({ sub: user.id, tenantId: user.tenantId, role: user.role }, env.jwtSecret);
  return { token, user };
}
