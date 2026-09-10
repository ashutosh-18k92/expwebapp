import { NextResponse } from "next/server";
import { getDb, type UserDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from "@/lib/native-permissions";
import { reconcileWebDevicesForCategory } from "@/lib/notification-topics-admin";

function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === "string" && (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const category = body?.category;
  const enabled = body?.enabled;

  if (!isNotificationCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${NOTIFICATION_CATEGORIES.join(", ")}.` },
      { status: 400 },
    );
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const db = await getDb();
  await db
    .collection<UserDoc>("users")
    .updateOne({ _id: user._id }, { $set: { [`notificationTopics.${category}`]: enabled } });

  // Native subscribes/unsubscribes itself client-side (see
  // NotificationTopics in lib/native-permissions.ts) - this only ever
  // touches this account's web devices, which have no client-side
  // equivalent.
  await reconcileWebDevicesForCategory(user._id, category, enabled);

  return NextResponse.json({ ok: true });
}
