import { nativeLocationStrategy, nativeNotificationStrategy } from "@/lib/permission-strategies/native";
import { webLocationStrategy, webNotificationStrategy } from "@/lib/permission-strategies/web";
import type { NotificationStrategy, PermissionStrategy } from "@/lib/permission-strategies/types";

export function getStrategies(isNative: boolean): {
  notification: NotificationStrategy;
  location: PermissionStrategy;
} {
  return isNative
    ? { notification: nativeNotificationStrategy, location: nativeLocationStrategy }
    : { notification: webNotificationStrategy, location: webLocationStrategy };
}

export type { NotificationStrategy, PermissionStrategy } from "@/lib/permission-strategies/types";
