import { NotificationPrimer, NotificationTopics, NOTIFICATION_CATEGORIES } from "@/lib/native-permissions";
import type { NotificationTopicPreferences } from "@/components/SettingsToggles";

/**
 * Applies the persisted notification-category preferences (Settings is the
 * source of truth) to this device's actual FCM subscriptions. FCM has no
 * on-device query API for current subscriptions, and subscribe/unsubscribe
 * are idempotent, so this is safe to call on every sign-in / app open, not
 * just from the Settings screen - it's what keeps a device in sync after a
 * reinstall, a new device, or a token rotation, none of which carry over
 * previous topic subscriptions even though the saved preference in Mongo
 * didn't change.
 */
export async function reconcileNotificationTopics(topics: NotificationTopicPreferences): Promise<void> {
  const { granted } = await NotificationPrimer.isNotificationGranted();
  if (!granted) return;

  for (const category of NOTIFICATION_CATEGORIES) {
    const method = topics[category] ? "subscribe" : "unsubscribe";
    await NotificationTopics[method]({ category }).catch(() => {
      // Best-effort; the next sign-in/app open will retry.
    });
  }
}
