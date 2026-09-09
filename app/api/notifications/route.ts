import { NextResponse } from "next/server";
import { getDb, type NotificationDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const db = await getDb();
  const notifications = await db
    .collection<NotificationDoc>("notifications")
    .find({ userId: user._id })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({ notifications });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const db = await getDb();
  await db.collection<NotificationDoc>("notifications").deleteMany({ userId: user._id });

  return NextResponse.json({ ok: true });
}
