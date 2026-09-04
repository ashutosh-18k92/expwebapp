import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type SessionDoc, type UserDoc } from "@/lib/db";

const SESSION_COOKIE = "fog_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);

  const db = await getDb();
  await db.collection<SessionDoc>("sessions").insertOne({
    _id: hashToken(token),
    userId,
    expiresAt,
    createdAt: now,
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

export async function getCurrentUser(): Promise<UserDoc | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const session = await db.collection<SessionDoc>("sessions").findOne({ _id: hashToken(token) });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  const user = await db.collection<UserDoc>("users").findOne({ _id: session.userId });
  return user ?? null;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.collection<SessionDoc>("sessions").deleteOne({ _id: hashToken(token) });
  }
  cookieStore.delete(SESSION_COOKIE);
}
