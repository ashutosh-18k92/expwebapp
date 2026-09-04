import { NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: user._id }, { $set: { biometricEnabled: false } });

  return NextResponse.json({ ok: true });
}
