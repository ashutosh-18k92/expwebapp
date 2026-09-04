import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { emailCollation, getDb, type UserDoc } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DUPLICATE_KEY_ERROR = 11000;

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

  const db = await getDb();
  const users = db.collection<UserDoc>("users");

  const existing = await users.findOne({ email }, emailCollation());
  if (existing) {
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const { hash, salt } = hashPassword(password);
  const id = randomUUID();

  try {
    await users.insertOne({
      _id: id,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      biometricEnabled: false,
      createdAt: new Date(),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === DUPLICATE_KEY_ERROR) {
      return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    }
    throw error;
  }

  await createSession(id);

  return NextResponse.json({ ok: true });
}
