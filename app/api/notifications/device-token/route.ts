import { NextResponse } from "next/server";
import { getDb, type DeviceDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { reconcileNewWebDevice } from "@/lib/notification-topics-admin";

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

  await db.collection<DeviceDoc>("devices").updateOne(
    { _id: token },
    {
      $set: { userId: user._id, platform, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );

  // A brand-new web device has no subscriptions yet - bring it in line with
  // whatever this account already has turned on. Native subscribes itself
  // on-device, so this only matters for web.
  if (isNewDevice && platform === "web") {
    await reconcileNewWebDevice(user._id, user.notificationTopics);
  }

  return NextResponse.json({ ok: true });
}
