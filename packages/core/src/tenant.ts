export type TenantType = "personal" | "business";

export type TenantPlan = "trial" | "personal" | "business" | "enterprise";

export interface Tenant {
  id: string;
  type: TenantType;
  name: string;
  plan: TenantPlan;
  /** ISO 3166-1 alpha-2, drives data residency + compliance rules (DPDP, GDPR, TCPA, TRAI). */
  dataRegion: string;
  createdAt: string;
}

export type TenantRole = "owner" | "admin" | "manager" | "operator" | "auditor";

export interface TenantUser {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: TenantRole;
  createdAt: string;
}
