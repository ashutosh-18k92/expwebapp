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

export const LocationPrimer = registerPlugin<LocationPrimerPlugin>("LocationPrimer");
export const NotificationPrimer = registerPlugin<NotificationPrimerPlugin>("NotificationPrimer");
export const BiometricPrimer = registerPlugin<BiometricPrimerPlugin>("BiometricPrimer");
export const NotificationTopics = registerPlugin<NotificationTopicsPlugin>("NotificationTopics");
export const PushToken = registerPlugin<PushTokenPlugin>("PushToken");
