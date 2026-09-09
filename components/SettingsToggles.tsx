"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  BiometricPrimer,
  LocationPrimer,
  NotificationPrimer,
  NotificationTopics,
  type NotificationCategory,
} from "@/lib/native-permissions";
import { reconcileNotificationTopics } from "@/lib/reconcile-notification-topics";
import {
  BiometricIcon,
  LocationIcon,
  NotificationIcon,
  PermissionPrimer,
} from "@/components/PermissionPrimer";
import { Toggle } from "@/components/Toggle";

type PrimerScreen = "location" | "notifications" | "biometrics" | null;

export interface NotificationTopicPreferences {
  essentials: boolean;
  promotions: boolean;
  feeds: boolean;
}

export function SettingsToggles({
  biometricEnabledInitial,
  notificationTopicsInitial,
}: {
  biometricEnabledInitial: boolean;
  notificationTopicsInitial: NotificationTopicPreferences;
}) {
  const isNative = Capacitor.isNativePlatform();

  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(biometricEnabledInitial);
  const [topics, setTopics] = useState(notificationTopicsInitial);
  const [activePrimer, setActivePrimer] = useState<PrimerScreen>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;

    LocationPrimer.isLocationGranted().then((result) => {
      if (!cancelled) setLocationGranted(result.granted);
    });
    NotificationPrimer.isNotificationGranted().then((result) => {
      if (cancelled) return;
      setNotificationGranted(result.granted);
      // Reconcile device subscription state to the persisted preference
      // every time Settings mounts, same as on sign-in (see
      // components/TopicSync.tsx) - this is the mechanism that actually
      // applies a default (e.g. Essentials on by default for a new user) on
      // the device, and re-applies it if this mount raced sign-in's own.
      reconcileNotificationTopics(notificationTopicsInitial);
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
  }, [isNative, notificationTopicsInitial]);

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

  async function handleTopicToggle(category: NotificationCategory, next: boolean) {
    setError(null);
    try {
      await NotificationTopics[next ? "subscribe" : "unsubscribe"]({ category });
    } catch {
      setError("Couldn't update that notification setting. Try again.");
      return;
    }
    const response = await fetch("/api/notifications/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, enabled: next }),
    });
    if (response.ok) {
      setTopics((prev) => ({ ...prev, [category]: next }));
    } else {
      setError("Couldn't save that notification setting. Try again.");
    }
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
      {/*
        Captions below are customer-facing copy - DRAFT, needs Compliance
        sign-off before ship (financial promotion under FOGIL's FCA
        authorisation), particularly Promotions/Feeds which are
        marketing-adjacent.
      */}
      <Toggle
        label="Essentials"
        caption={
          !isNative || !notificationGranted
            ? "Turn on notifications above first."
            : "Claims updates, policy and renewal reminders."
        }
        checked={topics.essentials}
        disabled={!isNative || !notificationGranted}
        onChange={(next) => handleTopicToggle("essentials", next)}
      />
      <Toggle
        label="Promotions"
        caption={
          !isNative || !notificationGranted
            ? "Turn on notifications above first."
            : "Offers and marketing updates."
        }
        checked={topics.promotions}
        disabled={!isNative || !notificationGranted}
        onChange={(next) => handleTopicToggle("promotions", next)}
      />
      <Toggle
        label="Feeds"
        caption={
          !isNative || !notificationGranted
            ? "Turn on notifications above first."
            : "Travel tips and destination content."
        }
        checked={topics.feeds}
        disabled={!isNative || !notificationGranted}
        onChange={(next) => handleTopicToggle("feeds", next)}
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
