"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { BiometricPrimer, LocationPrimer, NotificationPrimer } from "@/lib/native-permissions";
import {
  BiometricIcon,
  LocationIcon,
  NotificationIcon,
  PermissionPrimer,
} from "@/components/PermissionPrimer";
import { Toggle } from "@/components/Toggle";

type PrimerScreen = "location" | "notifications" | "biometrics" | null;

export function SettingsToggles({ biometricEnabledInitial }: { biometricEnabledInitial: boolean }) {
  const isNative = Capacitor.isNativePlatform();

  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(biometricEnabledInitial);
  const [activePrimer, setActivePrimer] = useState<PrimerScreen>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;

    LocationPrimer.isLocationGranted().then((result) => {
      if (!cancelled) setLocationGranted(result.granted);
    });
    NotificationPrimer.isNotificationGranted().then((result) => {
      if (!cancelled) setNotificationGranted(result.granted);
    });
    BiometricPrimer.isAvailable()
      .then((result) => {
        if (!cancelled) setBiometricAvailable(result.available);
      })
      .catch(() => {
        if (!cancelled) setBiometricAvailable(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isNative]);

  function closePrimer() {
    setActivePrimer(null);
  }

  function handleLocationToggle(next: boolean) {
    if (next) setActivePrimer("location");
  }

  function handleNotificationToggle(next: boolean) {
    if (next) setActivePrimer("notifications");
  }

  async function handleBiometricToggle(next: boolean) {
    setError(null);
    if (next) {
      setActivePrimer("biometrics");
      return;
    }
    const response = await fetch("/api/auth/biometric/disable", { method: "POST" });
    if (response.ok) setBiometricEnabled(false);
  }

  async function handleLocationAllow() {
    const result = await LocationPrimer.requestPermission();
    setLocationGranted(result.granted);
    setActivePrimer(null);
  }

  async function handleNotificationAllow() {
    const result = await NotificationPrimer.requestPermission();
    setNotificationGranted(result.granted);
    setActivePrimer(null);
  }

  async function handleBiometricAllow() {
    const result = await BiometricPrimer.authenticate({ title: "Confirm it's you" });
    setActivePrimer(null);
    if (!result.success) {
      setError(result.error ?? "Biometric check did not succeed.");
      return;
    }
    const response = await fetch("/api/auth/biometric/enable", { method: "POST" });
    if (response.ok) setBiometricEnabled(true);
  }

  return (
    <div className="flex flex-col">
      <Toggle
        label="Notifications"
        caption={
          !isNative
            ? "Not available - open this in the FOG app."
            : notificationGranted
              ? "Managed in your device settings."
              : "Get updates on claims, renewals and offers."
        }
        checked={notificationGranted}
        disabled={!isNative || notificationGranted}
        onChange={handleNotificationToggle}
      />
      <Toggle
        label="Location"
        caption={
          !isNative
            ? "Not available - open this in the FOG app."
            : locationGranted
              ? "Managed in your device settings."
              : "Personalised guides and offers when you're abroad."
        }
        checked={locationGranted}
        disabled={!isNative || locationGranted}
        onChange={handleLocationToggle}
      />
      <Toggle
        label="Biometric sign-in"
        caption={
          !isNative || !biometricAvailable
            ? "Not available on this device."
            : "Use your fingerprint or face to unlock the app."
        }
        checked={biometricEnabled}
        disabled={!isNative || !biometricAvailable}
        onChange={handleBiometricToggle}
      />

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {activePrimer === "location" && (
        <PermissionPrimer
          icon={<LocationIcon />}
          title="Enable location services"
          description="Get personalised guides to restaurants, beaches, and special offers when you're abroad."
          allowLabel="Allow Location Access"
          onAllow={handleLocationAllow}
          onDismiss={closePrimer}
        />
      )}

      {activePrimer === "notifications" && (
        <PermissionPrimer
          icon={<NotificationIcon />}
          title="Turn on notifications"
          description="Stay updated on claims progress, policy renewals, expiry reminders, and exclusive Bounce customer offers."
          allowLabel="Enable Notifications"
          onAllow={handleNotificationAllow}
          onDismiss={closePrimer}
        />
      )}

      {activePrimer === "biometrics" && (
        <PermissionPrimer
          icon={<BiometricIcon />}
          title="Enable biometric sign-in"
          description="Use your fingerprint or face to get back into the app quickly next time."
          allowLabel="Enable Biometric Sign-in"
          onAllow={handleBiometricAllow}
          onDismiss={closePrimer}
        />
      )}
    </div>
  );
}
