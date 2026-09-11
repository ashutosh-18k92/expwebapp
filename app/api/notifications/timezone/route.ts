import { NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const timeZone = body?.timeZone;

  if (!isValidTimeZone(timeZone)) {
    return NextResponse.json({ error: "timeZone must be a valid IANA time zone identifier." }, { status: 400 });
  }

  const db = await getDb();
  await db.collection<UserDoc>("users").updateOne({ _id: user._id }, { $set: { timeZone } });

  return NextResponse.json({ ok: true });
}
