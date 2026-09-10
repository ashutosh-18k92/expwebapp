import { getMessaging } from "firebase-admin/messaging";
import { initFirebaseAdmin } from "@/lib/firebase-admin";
import { getDb, type DeviceDoc, type NotificationTopicPreferences } from "@/lib/db";
import { BRAND_ID } from "@/lib/brand";

initFirebaseAdmin();

/**
 * Server-side counterpart to the native NotificationTopicsPlugin: a browser
 * has no client-side subscribeToTopic API, so a web push token can only be
 * (un)subscribed via the Admin SDK, here. Native devices subscribe/
 * unsubscribe themselves on-device and are never touched by this - only
 * `platform: "web"` devices are looked up.
 *
 * Brand comes from this deployment's own NEXT_PUBLIC_BRAND_ID (see
 * lib/brand.ts) - every user in this database belongs to the same brand, so
 * it's never looked up per-user.
 */
export async function reconcileWebDevicesForCategory(
  userId: string,
  category: string,
  subscribed: boolean,
): Promise<void> {
  if (!BRAND_ID) {
    console.warn("reconcileWebDevicesForCategory: NEXT_PUBLIC_BRAND_ID is not set, skipping");
    return;
  }

  const db = await getDb();
  const webDevices = await db
    .collection<DeviceDoc>("devices")
    .find({ userId, platform: "web" })
    .toArray();
  if (webDevices.length === 0) return;

  const tokens = webDevices.map((device) => device._id);
  const topic = `${BRAND_ID}-${category}`;

  const messaging = getMessaging();
  const result = subscribed
    ? await messaging.subscribeToTopic(tokens, topic)
    : await messaging.unsubscribeFromTopic(tokens, topic);

  if (result.failureCount > 0) {
    console.warn(
      `reconcileWebDevicesForCategory: ${result.failureCount}/${tokens.length} token(s) failed for topic "${topic}"`,
      result.errors,
    );
  }
}

/** Reconciles every currently-enabled category to one newly (re-)registered web device. */
export async function reconcileNewWebDevice(
  userId: string,
  notificationTopics: NotificationTopicPreferences,
): Promise<void> {
  const categories = Object.entries(notificationTopics).filter(([, enabled]) => enabled);
  await Promise.all(categories.map(([category]) => reconcileWebDevicesForCategory(userId, category, true)));
}
