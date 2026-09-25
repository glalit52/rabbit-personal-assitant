const AUTHORITY = "https://login.microsoftonline.com/common/oauth2/v2.0";

/**
 * `common` accepts both personal Microsoft accounts and work/school (Microsoft 365)
 * accounts with one app registration — matches the PRD's "Outlook / Microsoft 365"
 * line item without asking the tenant which kind of account they have.
 */
export const MICROSOFT_SCOPES = [
  "offline_access",
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.ReadWrite",
];

export interface MicrosoftOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface MicrosoftTokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

export function buildMicrosoftAuthUrl(config: MicrosoftOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: MICROSOFT_SCOPES.join(" "),
    state,
  });
  return `${AUTHORITY}/authorize?${params.toString()}`;
}

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export async function exchangeMicrosoftAuthCode(config: MicrosoftOAuthConfig, code: string): Promise<MicrosoftTokenSet> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token exchange failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as MicrosoftTokenResponse;
  if (!data.refresh_token) {
    throw new Error("Microsoft did not return a refresh token — offline_access must be granted on consent");
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export async function refreshMicrosoftAccessToken(
  config: MicrosoftOAuthConfig,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: number }> {
  const res = await fetch(`${AUTHORITY}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      scope: MICROSOFT_SCOPES.join(" "),
    }),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token refresh failed (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as MicrosoftTokenResponse;
  // Microsoft rotates refresh tokens on every use, unlike Google — the old one is invalid after this call.
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
}

export function isExpiringSoon(tokenSet: MicrosoftTokenSet, skewMs = 60_000): boolean {
  return Date.now() >= tokenSet.expiresAt - skewMs;
}

export async function fetchMicrosoftEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Microsoft profile (${res.status})`);
  }
  const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
  const email = data.mail ?? data.userPrincipalName;
  if (!email) {
    throw new Error("Microsoft profile response did not include an email address");
  }
  return email;
}
