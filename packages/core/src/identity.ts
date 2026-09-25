/**
 * A connected external account. `google` and `microsoft` each cover mail + calendar
 * in one OAuth connection (Gmail+Calendar, Outlook mail+Calendar respectively) —
 * matching how each provider's own OAuth consent screen works, rather than treating
 * mail and calendar as separate connections to the same account.
 */
export type Provider =
  | "google"
  | "microsoft"
  | "imap"
  | "whatsapp_business"
  | "sms"
  | "voice"
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
