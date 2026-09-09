"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { reconcileNotificationTopics } from "@/lib/reconcile-notification-topics";
import type { NotificationTopicPreferences } from "@/components/SettingsToggles";

/**
 * No UI. Applies the signed-in user's persisted notification-category
 * preferences to this device's FCM subscriptions once per mount. Settings
 * is the source of truth for those preferences, but a reinstall, a new
 * device, or an FCM token rotation resets the device's actual subscriptions
 * to nothing without touching the saved preference in Mongo - previously
 * that mismatch only got fixed the next time someone opened the Settings
 * screen. Mounting this on the dashboard (the page every sign-in and every
 * app open with an existing session lands on) closes that gap.
 */
export function TopicSync({ notificationTopics }: { notificationTopics: NotificationTopicPreferences }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    reconcileNotificationTopics(notificationTopics);
  }, [notificationTopics]);

  return null;
}
