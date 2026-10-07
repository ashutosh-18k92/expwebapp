import { NextResponse } from "next/server";
import { getDb, type UserPreferencesDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_RE.test(value);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const enabled = body?.enabled;
  const startTime = body?.startTime;
  const endTime = body?.endTime;

  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }
  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return NextResponse.json({ error: "startTime and endTime must be in HH:MM format." }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date();
  await db.collection<UserPreferencesDoc>("user_preferences").updateOne(
    { _id: user._id },
    {
      $set: { quietHours: { enabled, startTime, endTime }, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  return NextResponse.json({ ok: true });
}
