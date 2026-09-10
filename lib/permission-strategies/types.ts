export interface PermissionStrategy {
  isGranted(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
}

export interface NotificationStrategy extends PermissionStrategy {
  /** Returns null if unsupported, not yet permitted, or not yet configured (see lib/firebase-web.ts). */
  getDeviceToken(): Promise<string | null>;
}
