import { NextResponse } from "next/server";
import { getDb, type DeviceDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { reconcileNewWebDevice } from "@/lib/notification-topics-admin";

// Defensive default for a user doc predating preferences.notificationTopics.
const DEFAULT_NOTIFICATION_TOPICS = { essentials: true, promotions: false, feeds: false };

function isPlatform(value: unknown): value is DeviceDoc["platform"] {
  return value === "native" || value === "web";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const token = body?.token;
  const platform = body?.platform;

  if (typeof token !== "string" || token.length === 0) {
    return NextResponse.json({ error: "token must be a non-empty string." }, { status: 400 });
  }
  if (!isPlatform(platform)) {
    return NextResponse.json({ error: "platform must be 'native' or 'web'." }, { status: 400 });
  }

  const db = await getDb();
  const now = new Date();
  const isNewDevice =
    (await db.collection<DeviceDoc>("devices").findOne({ _id: token })) === null;

  // findOneAndUpdate rather than updateOne, so the caller (SettingsToggles,
  // via lib/register-device.ts) learns this specific device's own
  // notificationsEnabled (SRS FR-2.9) in the same round trip, rather than
  // needing a second request right after registering.
  const device = await db.collection<DeviceDoc>("devices").findOneAndUpdate(
    { _id: token },
    {
      $set: { userId: user._id, platform, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, returnDocument: "after" },
  );

  // A brand-new web device has no subscriptions yet - bring it in line with
  // whatever this account already has turned on. Native subscribes itself
  // on-device, so this only matters for web.
  if (isNewDevice && platform === "web") {
    await reconcileNewWebDevice(user._id, user.preferences?.notificationTopics ?? DEFAULT_NOTIFICATION_TOPICS);
  }

  return NextResponse.json({ ok: true, notificationsEnabled: device?.notificationsEnabled === true });
}
