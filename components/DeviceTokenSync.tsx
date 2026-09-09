"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { PushToken } from "@/lib/native-permissions";

/**
 * No UI. Registers this device's current FCM token against the signed-in
 * user once per mount, so fog-push-notification-service can target this
 * user directly (see /api/notifications/device-token). Android only - the
 * plugin simply doesn't exist on web/iOS builds, and getToken() there would
 * never resolve a real token anyway.
 */
export function DeviceTokenSync() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;

    PushToken.getToken()
      .then((result) => {
        if (cancelled || !result.token) return;
        return fetch("/api/notifications/device-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: result.token }),
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
