/** A connected external account (email inbox, WhatsApp number, calendar, CRM, ...). */
export type Provider =
  | "gmail"
  | "google_workspace"
  | "outlook"
  | "imap"
  | "whatsapp_business"
  | "sms"
  | "voice"
  | "google_calendar"
  | "microsoft_calendar"
  | "google_drive"
  | "hubspot"
  | "salesforce"
  | "zendesk"
  | "quickbooks"
  | "generic_webhook";

export type IdentityHealth = "connected" | "expired" | "revoked" | "error";

export interface Identity {
  id: string;
  tenantId: string;
  provider: Provider;
  /** Scopes actually granted by the provider, least-privilege. */
  scopes: string[];
  /** Opaque reference into the secrets vault — never the raw token. */
  credentialRef: string;
  health: IdentityHealth;
  createdAt: string;
}
