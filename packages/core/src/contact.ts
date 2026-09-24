export type TrustLevel = "unknown" | "known" | "vip" | "blocked";

export interface Contact {
  id: string;
  tenantId: string;
  names: string[];
  phones: string[];
  emails: string[];
  /** Handles on other channels: whatsapp:+1..., x:@handle, telegram:@handle */
  handles: string[];
  company?: string;
  tags: string[];
  trustLevel: TrustLevel;
  createdAt: string;
}
