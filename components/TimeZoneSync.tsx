"use client";

import { useEffect } from "react";

/**
 * No UI. Detects this device's current IANA time zone and syncs it to the
 * signed-in user's account on every mount, so fog-push-notification-service
 * can evaluate quiet hours in the recipient's actual local time (see
 * lib/quiet-hours.ts there) even after they've travelled somewhere new.
 * Needs no permission - unlike Location, this is independent of that
 * feature entirely.
 */
export function TimeZoneSync() {
  useEffect(() => {
    let timeZone: string;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!timeZone) return;

    fetch("/api/notifications/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timeZone }),
    }).catch(() => {
      // Best-effort; the next app open will retry.
    });
  }, []);

  return null;
}
