import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let cached: { sql: postgres.Sql; db: Database } | undefined;

export function createDb(connectionString: string): { sql: postgres.Sql; db: Database } {
  const sql = postgres(connectionString, { max: 10 });
  const db = drizzle(sql, { schema });
  return { sql, db };
}

/** Process-wide singleton for apps that only ever talk to one database URL. */
export function getDb(connectionString = process.env.DATABASE_URL): { sql: postgres.Sql; db: Database } {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!cached) {
    cached = createDb(connectionString);
  }
  return cached;
}

export { schema };
