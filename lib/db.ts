import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const globalForDb = globalThis as unknown as { fogDb?: DatabaseSync };

export const db =
  globalForDb.fogDb ??
  new DatabaseSync(path.join(dataDir, "app.db"));

if (!globalForDb.fogDb) {
  globalForDb.fogDb = db;

  db.exec(`
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

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  password_salt: string;
  biometric_enabled: number;
  created_at: number;
}

export interface SessionRow {
  id: string;
  user_id: string;
  expires_at: number;
  created_at: number;
}
