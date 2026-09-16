import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type SessionDoc, type UserDoc } from "@/lib/db";
import { FOG_NATIVE_CLIENT_COOKIE } from "@/lib/native-client";

export const SESSION_COOKIE = "fog_session";
const MOBILE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days - native app, set via proxy.ts's fog_native_client cookie
const BROWSER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days - plain browser
// Native sessions slide forward on return visits (proxy.ts) instead of
// expiring 90 days after the original login - re-issued at most once a day
// per session so an actively-returning user doesn't write to Mongo on every
// request.
const NATIVE_RENEWAL_INTERVAL_SECONDS = 60 * 60 * 24;

export function hashToken(token: string): string {
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
  await Promise.all([
    db.collection<SessionDoc>("sessions").insertOne({
      _id: hashToken(token),
      userId,
      expiresAt,
      createdAt: now,
    }),
    db.collection<UserDoc>("users").updateOne({ _id: userId }, { $set: { lastLoginAt: now } }),
  ]);

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

// Sliding-window renewal for native sessions only (proxy.ts calls this on
// every native page request) - independent of biometricEnabled entirely.
// Returns the TTL to re-issue the cookie with, or null when there's nothing
// to renew (no session, already expired, or not yet due).
export async function renewNativeSessionIfStale(token: string): Promise<number | null> {
  const db = await getDb();
  const sessions = db.collection<SessionDoc>("sessions");
  const session = await sessions.findOne({ _id: hashToken(token) });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;

  const now = Date.now();
  const renewalThresholdMs = (MOBILE_SESSION_TTL_SECONDS - NATIVE_RENEWAL_INTERVAL_SECONDS) * 1000;
  if (session.expiresAt.getTime() - now >= renewalThresholdMs) return null;

  const expiresAt = new Date(now + MOBILE_SESSION_TTL_SECONDS * 1000);
  await Promise.all([
    sessions.updateOne({ _id: session._id }, { $set: { expiresAt } }),
    db.collection<UserDoc>("users").updateOne({ _id: session.userId }, { $set: { lastLoginAt: new Date(now) } }),
  ]);
  return MOBILE_SESSION_TTL_SECONDS;
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
