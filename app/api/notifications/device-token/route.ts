import { NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const token = body?.token;

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "token must be a non-empty string." }, { status: 400 });
  }

  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: user._id }, { $set: { fcmToken: token, fcmTokenUpdatedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
