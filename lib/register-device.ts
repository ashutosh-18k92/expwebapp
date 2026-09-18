// Shared by components/DeviceTokenSync.tsx (registers this device on every
// dashboard mount) and components/SettingsToggles.tsx (also needs to learn
// this specific device's own notificationsEnabled, SRS FR-2.9, which the
// server only knows once the device is registered).
export async function registerDevice(
  token: string,
  platform: "native" | "web",
): Promise<{ notificationsEnabled: boolean }> {
  const response = await fetch("/api/notifications/device-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  if (!response.ok) throw new Error("Failed to register device");
  const data = await response.json();
  return { notificationsEnabled: data?.notificationsEnabled === true };
}
