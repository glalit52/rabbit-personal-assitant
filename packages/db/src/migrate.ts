import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = postgres(connectionString, { max: 1 });
  // pgvector must exist before the generated migrations reference the `vector` type.
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  await sql.end();
  // eslint-disable-next-line no-console
  console.log("Migrations applied.");
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
