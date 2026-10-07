import { NextResponse } from "next/server";
import { getDb, getNotificationTopicsCatalog, type NotificationTopicDoc, type UserDoc } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { reconcileWebDevicesForCategory } from "@/lib/notification-topics-admin";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const db = await getDb();
  return NextResponse.json({ topics: await getNotificationTopicsCatalog(db) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const topicId = body?.topicId;
  const enabled = body?.enabled;

  if (typeof topicId !== "string" || topicId.length === 0) {
    return NextResponse.json({ error: "topicId must be a non-empty string." }, { status: 400 });
  }
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 });
  }

  const db = await getDb();
  const topic = await db.collection<NotificationTopicDoc>("notification_topics").findOne({ _id: topicId });
  if (!topic) {
    return NextResponse.json({ error: `Unknown topicId "${topicId}".` }, { status: 400 });
  }

  await db
    .collection<UserDoc>("users")
    .updateOne(
      { _id: user._id },
      enabled ? { $addToSet: { "preferences.subscribedTopics": topicId } } : { $pull: { "preferences.subscribedTopics": topicId } },
    );

  // Native subscribes/unsubscribes itself client-side (see
  // NotificationTopics in lib/native-permissions.ts) - this only ever
  // touches this account's web devices, which have no client-side
  // equivalent.
  await reconcileWebDevicesForCategory(user._id, topicId, enabled);

  return NextResponse.json({ ok: true });
}
