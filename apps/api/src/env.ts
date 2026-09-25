function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get redisUrl() {
    return process.env.REDIS_URL;
  },
  get jwtSecret() {
    return required("JWT_SECRET");
  },
  get vaultMasterKey() {
    return process.env.VAULT_MASTER_KEY;
  },
  get port() {
    return Number(process.env.API_PORT ?? 4000);
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  get apiUrl() {
    return process.env.API_URL ?? "http://localhost:4000";
  },
  get google() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return undefined;
    return { clientId, clientSecret, redirectUri: `${env.apiUrl}/connectors/google/callback` };
  },
  get whatsappAppSecret() {
    return process.env.WHATSAPP_APP_SECRET;
  },
  get whatsappWebhookVerifyToken() {
    return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  },
};
