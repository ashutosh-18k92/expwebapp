import type { QuietHoursPreference } from "@/components/SettingsToggles";

const CACHE_KEY = "fog:settings-cache:v1";

export interface CachedSettingsState {
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  locationGranted: boolean;
  quietHours: QuietHoursPreference;
}

/**
 * On-device cache of the last-known state of the three top-level Settings
 * toggles, so SettingsToggles can seed its UI instantly on mount instead of
 * flashing "off" while the real checks (native/Web permission calls, and
 * for biometricEnabled the LocalSettingsCache plugin read - FR-2.7 is a
 * per-device preference with no server copy at all) are still resolving.
 * This is purely a perceived-latency optimisation - the real checks still
 * run every mount and are what's actually trusted; this cache only fills
 * the gap until they resolve, and is corrected the moment they do.
 *
 * Backed by localStorage rather than a Capacitor plugin: the Capacitor
 * WebView on Android is a real system WebView with normal Web Storage
 * support, so no native dependency is needed for this, on either platform
 * this app runs on (native shell or plain browser).
 */
export function readSettingsCache(): Partial<CachedSettingsState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Partial<CachedSettingsState>) : null;
  } catch {
    // Storage disabled/unavailable (e.g. private browsing) - callers just
    // fall back to whatever they'd render without a cache.
    return null;
  }
}

export function writeSettingsCache(patch: Partial<CachedSettingsState>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readSettingsCache() ?? {};
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...patch }));
  } catch {
    // Best-effort; next mount just re-derives everything as it does today.
  }
}
