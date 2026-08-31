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

export const LocationPrimer = registerPlugin<LocationPrimerPlugin>("LocationPrimer");
export const NotificationPrimer = registerPlugin<NotificationPrimerPlugin>("NotificationPrimer");
