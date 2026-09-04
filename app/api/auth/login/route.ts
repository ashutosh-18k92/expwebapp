import { NextResponse } from "next/server";
import { emailCollation, getDb, type UserDoc } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const db = await getDb();
  const user = await db.collection<UserDoc>("users").findOne({ email }, emailCollation());

  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await createSession(user._id);

  return NextResponse.json({ ok: true });
}
