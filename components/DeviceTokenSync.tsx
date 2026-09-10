"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { getStrategies } from "@/lib/permission-strategies";

/**
 * No UI. Registers this device's current push token (native FCM, or a web
 * push token once NEXT_PUBLIC_FIREBASE_VAPID_KEY is configured - see
 * lib/firebase-web.ts) against the signed-in user once per mount, so
 * fog-push-notification-service can target this user directly on any of
 * their devices (see /api/notifications/device-token and the `devices`
 * collection in lib/db.ts).
 */
export function DeviceTokenSync() {
  useEffect(() => {
    let cancelled = false;
    const isNative = Capacitor.isNativePlatform();

    getStrategies(isNative)
      .notification.getDeviceToken()
      .then((token) => {
        if (cancelled || !token) return;
        return fetch("/api/notifications/device-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, platform: isNative ? "native" : "web" }),
        });
      })
      .catch(() => {
        // Best-effort; the next app open will retry.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
