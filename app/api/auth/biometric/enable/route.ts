import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const db = await getDb();
  await db.execute({ sql: "UPDATE users SET biometric_enabled = 1 WHERE id = ?", args: [user.id] });

  return NextResponse.json({ ok: true });
}
