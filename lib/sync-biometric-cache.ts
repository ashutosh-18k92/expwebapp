import { LocalSettingsCache } from "@/lib/native-permissions";

/**
 * Mirrors the account's biometricEnabled preference (FR-2.7) into the
 * device's native settings cache, so the offline islands - which share no
 * cookies or web storage with this origin - can read it (SRS Section 9,
 * FR-9.1). Call on every load of the biometric-gated Home page and
 * immediately after every successful enable/disable write; a stale cached
 * value only self-corrects at the next one of those.
 */
export async function syncBiometricEnabledCache(enabled: boolean): Promise<void> {
  await LocalSettingsCache.setBiometricEnabled({ enabled }).catch(() => {
    // Best-effort; the next Home page mount or toggle retries.
  });
}
