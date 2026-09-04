import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type SessionDoc, type UserDoc } from "@/lib/db";
import { FOG_NATIVE_CLIENT_COOKIE } from "@/lib/native-client";

const SESSION_COOKIE = "fog_session";
const MOBILE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days - native app, set via proxy.ts's fog_native_client cookie
const BROWSER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - plain browser

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const isNativeClient = Boolean(cookieStore.get(FOG_NATIVE_CLIENT_COOKIE)?.value);
  const ttlSeconds = isNativeClient ? MOBILE_SESSION_TTL_SECONDS : BROWSER_SESSION_TTL_SECONDS;

  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const db = await getDb();
  await db.collection<SessionDoc>("sessions").insertOne({
    _id: hashToken(token),
    userId,
    expiresAt,
    createdAt: now,
  });

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ttlSeconds,
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
