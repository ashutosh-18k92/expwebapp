import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type UserRow } from "@/lib/db";

const SESSION_COOKIE = "fog_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;

  const db = await getDb();
  await db.execute({
    sql: "INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
    args: [hashToken(token), userId, expiresAt, now],
  });

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

  const db = await getDb();
  const sessionResult = await db.execute({
    sql: "SELECT user_id, expires_at FROM sessions WHERE id = ?",
    args: [hashToken(token)],
  });
  const session = sessionResult.rows[0] as unknown as
    | { user_id: string; expires_at: number }
    | undefined;

  if (!session || session.expires_at < Date.now()) return null;

  const userResult = await db.execute({
    sql: "SELECT * FROM users WHERE id = ?",
    args: [session.user_id],
  });
  const user = userResult.rows[0] as unknown as UserRow | undefined;

  return user ?? null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ?", args: [hashToken(token)] });
  }
  cookieStore.delete(SESSION_COOKIE);
}
