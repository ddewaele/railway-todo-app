import path from "node:path";
import { afterAll, beforeAll, beforeEach } from "vitest";

// Point the app at a dedicated test database before env.ts is evaluated.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5434/app_test";
process.env.SESSION_SECRET ??= "test-session-secret-not-for-production";
process.env.APP_URL ??= "http://localhost:3001";
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
// A minimal built SPA so static-serving tests exercise the real fallback logic.
process.env.STATIC_DIR = path.resolve(import.meta.dirname, "fixtures/static");

const { db, sql } = await import("../db/client.js");
const { runMigrations } = await import("../db/migrate.js");

beforeAll(async () => {
  await runMigrations(db);
});

beforeEach(async () => {
  // Truncate every application table (not Drizzle's migration journal).
  const rows = await sql<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> '__drizzle_migrations'`;
  if (rows.length > 0) {
    const names = rows.map((r) => `"${r.tablename}"`).join(", ");
    await sql.unsafe(`truncate table ${names} restart identity cascade`);
  }
});

afterAll(async () => {
  await sql.end();
});
