import { NextResponse } from "next/server";
import { db, type UserRow } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;

  if (!user || !verifyPassword(password, user.password_hash, user.password_salt)) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await createSession(user.id);

  return NextResponse.json({ ok: true });
}
