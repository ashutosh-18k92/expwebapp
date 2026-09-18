import { NextResponse } from "next/server";
import { getDb, type DeviceDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

// Device-scoped (SRS FR-2.9): notificationsEnabled lives on the `devices`
// collection, not the account, since a customer's phone and browser can
// each have their own separate on/off state for this. The caller (see
// lib/register-device.ts) always registers the device via
// /api/notifications/device-token first, so the row this matches against
// already exists by the time this is called.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const token = body?.token;
  const enabled = body?.enabled;

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "token must be a non-empty string." }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const db = await getDb();
  // Matched on userId too, not just the token, so one account can never
  // flip a device registered against a different account.
  const result = await db
    .collection<DeviceDoc>("devices")
    .updateOne({ _id: token, userId: user._id }, { $set: { notificationsEnabled: enabled } });

  if (result.matchedCount === 0) {
    return NextResponse.json({ error: "Device not registered for this account." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
