"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { LocationPrimer, NotificationPrimer } from "@/lib/native-permissions";
import { LocationIcon, NotificationIcon, PermissionPrimer } from "@/components/PermissionPrimer";
import { CurrencyConverter } from "@/components/CurrencyConverter";

type PrimerScreen = "location" | "notifications" | null;

export function HomeDemo() {
  const [locationStatus, setLocationStatus] = useState("Disallowed");
  const [notificationStatus, setNotificationStatus] = useState("Disallowed");
  const [activePrimer, setActivePrimer] = useState<PrimerScreen>(null);

  async function handleNotificationsClick() {
    if (!Capacitor.isNativePlatform()) {
      setNotificationStatus("Not running inside the native app - no Capacitor bridge available.");
      return;
    }
    const status = await NotificationPrimer.isNotificationGranted();
    if (status.granted) {
      setNotificationStatus(`Notifications: ${JSON.stringify({ granted: true, alreadyGranted: true })}`);
      return;
    }
    setActivePrimer("notifications");
  }

  async function handleLocationClick() {
    if (!Capacitor.isNativePlatform()) {
      setLocationStatus("Not running inside the native app - no Capacitor bridge available.");
      return;
    }
    const status = await LocationPrimer.isLocationGranted();
    if (status.granted) {
      setLocationStatus(`Location: ${JSON.stringify({ granted: true, alreadyGranted: true })}`);
      return;
    }
    setActivePrimer("location");
  }

  async function handleNotificationAllow() {
    const result = await NotificationPrimer.requestPermission();
    setNotificationStatus(`${JSON.stringify(result)}`);
    setActivePrimer(null);
  }

  async function handleLocationAllow() {
    const result = await LocationPrimer.requestPermission();
    setLocationStatus(`${JSON.stringify(result)}`);
    setActivePrimer(null);
  }

  function handleNotificationDismiss() {
    setNotificationStatus(`Notifications: ${JSON.stringify({ granted: false, dismissed: true })}`);
    setActivePrimer(null);
  }

  function handleLocationDismiss() {
    setLocationStatus(`Location: ${JSON.stringify({ granted: false, dismissed: true })}`);
    setActivePrimer(null);
  }

  return (
    <>
      <button
        onClick={handleNotificationsClick}
        className="bg-green-600 text-white p-2.5 rounded-2xl transition-colors hover:bg-green-700 active:bg-green-800"
      >
        Allow Notifications
      </button>
      <button
        onClick={handleLocationClick}
        className="bg-green-600 text-white p-2.5 rounded-2xl transition-colors hover:bg-green-700 active:bg-green-800"
      >
        Allow Location
      </button>
      <p>Location: {locationStatus}</p>
      <p>Notification: {notificationStatus}</p>

      <CurrencyConverter />

      {activePrimer === "notifications" && (
        <PermissionPrimer
          icon={<NotificationIcon />}
          title="Turn on notifications"
          description="Stay updated on claims progress, policy renewals, expiry reminders, and exclusive Bounce customer offers."
          allowLabel="Enable Notifications"
          onAllow={handleNotificationAllow}
          onDismiss={handleNotificationDismiss}
        />
      )}

      {activePrimer === "location" && (
        <PermissionPrimer
          icon={<LocationIcon />}
          title="Enable location services"
          description="Get personalised guides to restaurants, beaches, and special offers when you're abroad."
          allowLabel="Allow Location Access"
          onAllow={handleLocationAllow}
          onDismiss={handleLocationDismiss}
        />
      )}
    </>
  );
}
