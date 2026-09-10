import { getWebPushToken } from "@/lib/firebase-web";
import type { NotificationStrategy, PermissionStrategy } from "@/lib/permission-strategies/types";

export const webNotificationStrategy: NotificationStrategy = {
  async isGranted() {
    if (typeof Notification === "undefined") return false;
    return Notification.permission === "granted";
  },
  async requestPermission() {
    if (typeof Notification === "undefined") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  },
  async getDeviceToken() {
    return getWebPushToken();
  },
};

export const webLocationStrategy: PermissionStrategy = {
  async isGranted() {
    // Safari doesn't implement the Permissions API for geolocation - falls
    // through to false, and requestPermission() (getCurrentPosition) is
    // what actually surfaces the browser's own prompt there.
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return false;
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state === "granted";
    } catch {
      return false;
    }
  },
  async requestPermission() {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        resolve(false);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { timeout: 10_000 },
      );
    });
  },
};
