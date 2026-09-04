import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import path from "node:path";

const globalForDb = globalThis as unknown as { fogDb?: Client; fogDbSchema?: Promise<void> };

function createDbClient(): Client {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }

  // Local dev fallback: a plain SQLite file, no Turso account needed.
  // Never used on Vercel - /var/task is read-only, so TURSO_DATABASE_URL
  // must be set there.
  const dataDir = path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return createClient({ url: `file:${path.join(dataDir, "app.db")}` });
}

export const db = globalForDb.fogDb ?? createDbClient();
globalForDb.fogDb = db;

function ensureSchema(): Promise<void> {
  if (!globalForDb.fogDbSchema) {
    globalForDb.fogDbSchema = db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        biometric_enabled INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }
  return globalForDb.fogDbSchema;
}

export async function getDb(): Promise<Client> {
  await ensureSchema();
  return db;
}

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  biometric_enabled: number;
  created_at: number;
}
