import { LocationPrimer, NotificationPrimer, PushToken } from "@/lib/native-permissions";
import type { NotificationStrategy, PermissionStrategy } from "@/lib/permission-strategies/types";

export const nativeNotificationStrategy: NotificationStrategy = {
  async isGranted() {
    const result = await NotificationPrimer.isNotificationGranted();
    return result.granted;
  },
  async requestPermission() {
    const result = await NotificationPrimer.requestPermission();
    return result.granted;
  },
  async getDeviceToken() {
    const result = await PushToken.getToken();
    return result.token;
  },
};

export const nativeLocationStrategy: PermissionStrategy = {
  async isGranted() {
    const result = await LocationPrimer.isLocationGranted();
    return result.granted;
  },
  async requestPermission() {
    const result = await LocationPrimer.requestPermission();
    return result.granted;
  },
};
