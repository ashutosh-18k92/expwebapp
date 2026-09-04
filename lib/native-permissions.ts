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

export const LocationPrimer = registerPlugin<LocationPrimerPlugin>("LocationPrimer");
export const NotificationPrimer = registerPlugin<NotificationPrimerPlugin>("NotificationPrimer");
export const BiometricPrimer = registerPlugin<BiometricPrimerPlugin>("BiometricPrimer");
