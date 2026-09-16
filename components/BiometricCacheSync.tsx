"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { syncBiometricEnabledCache } from "@/lib/sync-biometric-cache";

/**
 * No UI. Mirrors the signed-in user's biometricEnabled preference into the
 * device's native settings cache on every Home page mount (SRS Section 9,
 * FR-9.1), so the offline islands - which share no cookies or web storage
 * with this origin - can read a value that isn't stale by more than one
 * app open. Mounted alongside BiometricGate rather than inside it, so this
 * still runs while the gate itself is locked.
 */
export function BiometricCacheSync({ biometricEnabled }: { biometricEnabled: boolean }) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    syncBiometricEnabledCache(biometricEnabled);
  }, [biometricEnabled]);

  return null;
}
