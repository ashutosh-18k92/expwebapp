import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db, type UserRow } from "@/lib/db";

const SESSION_COOKIE = "fog_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;

  db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    hashToken(token),
    userId,
    expiresAt,
    now,
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = db
    .prepare("SELECT * FROM sessions WHERE id = ?")
    .get(hashToken(token)) as { user_id: string; expires_at: number } | undefined;

  if (!session || session.expires_at < Date.now()) return null;

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(session.user_id) as
    | UserRow
    | undefined;

  return user ?? null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    db.prepare("DELETE FROM sessions WHERE id = ?").run(hashToken(token));
  }
  cookieStore.delete(SESSION_COOKIE);
}
