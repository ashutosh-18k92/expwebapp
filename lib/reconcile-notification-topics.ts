import { NotificationPrimer, NotificationTopics } from "@/lib/native-permissions";
import type { NotificationTopicCatalogEntry } from "@/lib/notification-topics-catalog";

/**
 * Applies the persisted subscribedTopics (Settings is the source of truth)
 * to this device's actual FCM subscriptions. FCM has no on-device query API
 * for current subscriptions, and subscribe/unsubscribe are idempotent, so
 * this is safe to call on every sign-in / app open, not just from the
 * Settings screen - it's what keeps a device in sync after a reinstall, a
 * new device, or a token rotation, none of which carry over previous topic
 * subscriptions even though the saved preference in Mongo didn't change.
 *
 * Skips any catalog entry where nativeAndroidTopic is false - this is where
 * "native stays static" is actually enforced on the web side: a brand-new
 * catalog topic with no native/FCM analogue is never passed to the plugin,
 * which would reject it anyway (see lib/native-permissions.ts).
 */
export async function reconcileNotificationTopics(
  subscribedTopics: string[],
  catalog: NotificationTopicCatalogEntry[],
): Promise<void> {
  const { granted } = await NotificationPrimer.isNotificationGranted();
  if (!granted) return;

  for (const topic of catalog) {
    if (!topic.nativeAndroidTopic) continue;
    const method = subscribedTopics.includes(topic._id) ? "subscribe" : "unsubscribe";
    await NotificationTopics[method]({ category: topic._id }).catch(() => {
      // Best-effort; the next sign-in/app open will retry.
    });
  }
}
