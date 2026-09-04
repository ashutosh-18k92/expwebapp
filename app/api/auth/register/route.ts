import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db, type UserRow } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | UserRow
    | undefined;
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const id = randomUUID();

  db.prepare(
    "INSERT INTO users (id, email, password_hash, password_salt, biometric_enabled, created_at) VALUES (?, ?, ?, ?, 0, ?)",
  ).run(id, email, hash, salt, Date.now());

  await createSession(id);

  return NextResponse.json({ ok: true });
}
