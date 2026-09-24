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
};
