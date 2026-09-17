import { registerPlugin } from "@capacitor/core";

export interface LocationPermissionResult {
  granted: boolean;
  fine?: boolean;
  coarse?: boolean;
  alreadyGranted?: boolean;
  dismissed?: boolean;
}

export interface NotificationPermissionResult {
  granted: boolean;
  alreadyGranted?: boolean;
  dismissed?: boolean;
}

interface LocationPrimerPlugin {
  requestPermission(): Promise<LocationPermissionResult>;
  isLocationGranted(): Promise<LocationPermissionResult>;
}

interface NotificationPrimerPlugin {
  requestPermission(): Promise<NotificationPermissionResult>;
  isNotificationGranted(): Promise<{ granted: boolean }>;
}

export interface BiometricAvailabilityResult {
  available: boolean;
  reason?: string;
}

export interface BiometricAuthenticateResult {
  success: boolean;
  error?: string;
}

interface BiometricPrimerPlugin {
  isAvailable(): Promise<BiometricAvailabilityResult>;
  authenticate(options: { title: string; subtitle?: string }): Promise<BiometricAuthenticateResult>;
}

/**
 * Categories a user can opt into from Settings. The plugin only ever takes a
 * category, never a topic string: the native side builds the real FCM topic
 * as this install's own brand_id plus the category (see
 * NotificationTopicsPlugin in fog-mobile-app), so the web side never needs
 * to know or choose which brand's topic it's touching.
 */
export const NOTIFICATION_CATEGORIES = ["essentials", "promotions", "feeds"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface TopicSubscriptionResult {
  subscribed: boolean;
}

interface NotificationTopicsPlugin {
  subscribe(options: { category: NotificationCategory }): Promise<TopicSubscriptionResult>;
  unsubscribe(options: { category: NotificationCategory }): Promise<TopicSubscriptionResult>;
}

export interface PushTokenResult {
  token: string | null;
}

interface PushTokenPlugin {
  getToken(): Promise<PushTokenResult>;
}

/**
 * Native-backed store the offline islands also read from, since they run on
 * a separate origin from this app and share no cookies or web storage with
 * it (see fog-mobile-app's islands/src/island-bridge.js).
 * setBiometricEnabled/getBiometricEnabled is the device's own, sole record
 * of the biometric sign-in preference (FR-2.7) - deliberately never stored
 * in Mongo, since it's a per-device convenience setting, not an
 * account-wide one: a second device signing into the same account starts
 * with it off. markUnlocked/isUnlocked/resetUnlock separately track the
 * offline gate's own process-lifetime "unlocked this app session" state
 * (SRS Section 9, FR-9.2) - resetUnlock is called from here
 * (BiometricGate.tsx) on logout, mirroring this app's own session-store
 * reset.
 */
interface LocalSettingsCachePlugin {
  setBiometricEnabled(options: { enabled: boolean }): Promise<void>;
  getBiometricEnabled(): Promise<{ enabled: boolean }>;
  markUnlocked(): Promise<void>;
  isUnlocked(): Promise<{ unlocked: boolean }>;
  resetUnlock(): Promise<void>;
}

/**
 * Native cache for a customer's downloaded policy documents (SRS Section
 * 11, FR-11.5): fog-mobile-app's offline "My policies" island shares no
 * filesystem/storage access with this origin (islands/src/island-bridge.js),
 * so a file downloaded here has no other way to reach it. `path` is a path
 * on this app's own origin only (e.g. "/<userId>/<fileName>"), never a full
 * URL - the native side resolves and validates it the same way FogShell's
 * loadRemote does, and derives the cached file's name from it. clearCache()
 * is called on sign-out (components/LogoutButton.tsx,
 * components/BiometricGate.tsx), mirroring LocalSettingsCache.resetUnlock(),
 * so at most one customer's policy documents are ever cached on a device.
 */
export interface PolicyCacheEntry {
  fileName: string;
  displayName: string;
  active: boolean;
  policyNumber?: string;
  coverType?: string;
  startDate?: string;
  endDate?: string;
}

interface PolicyCachePlugin {
  cacheFile(options: {
    path: string;
    displayName: string;
    active: boolean;
    policyNumber?: string;
    coverType?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<void>;
  listCachedFiles(): Promise<{ policies: PolicyCacheEntry[] }>;
  openFile(options: { fileName: string }): Promise<void>;
  clearCache(): Promise<void>;
}

export const LocationPrimer = registerPlugin<LocationPrimerPlugin>("LocationPrimer");
export const NotificationPrimer = registerPlugin<NotificationPrimerPlugin>("NotificationPrimer");
export const BiometricPrimer = registerPlugin<BiometricPrimerPlugin>("BiometricPrimer");
export const NotificationTopics = registerPlugin<NotificationTopicsPlugin>("NotificationTopics");
export const PushToken = registerPlugin<PushTokenPlugin>("PushToken");
export const LocalSettingsCache = registerPlugin<LocalSettingsCachePlugin>("LocalSettingsCache");
export const PolicyCache = registerPlugin<PolicyCachePlugin>("PolicyCache");
