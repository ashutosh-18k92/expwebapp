import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  db.prepare("UPDATE users SET biometric_enabled = 1 WHERE id = ?").run(user.id);

  return NextResponse.json({ ok: true });
}
