"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  BiometricPrimer,
  LocalSettingsCache,
  NotificationTopics,
  type NotificationCategory,
} from "@/lib/native-permissions";
import { reconcileNotificationTopics } from "@/lib/reconcile-notification-topics";
import { getStrategies } from "@/lib/permission-strategies";
import { readSettingsCache, writeSettingsCache } from "@/lib/settings-cache";
import { flushPendingSettingsWrites, writeSettingOptimistically } from "@/lib/settings-sync";
import {
  BiometricIcon,
  LocationIcon,
  NotificationIcon,
  PermissionPrimer,
} from "@/components/PermissionPrimer";
import { Toggle } from "@/components/Toggle";
import { Input } from "@/components/ui/input";

type PrimerScreen = "location" | "notifications" | "biometrics" | null;

export interface NotificationTopicPreferences {
  essentials: boolean;
  promotions: boolean;
  feeds: boolean;
}

export interface QuietHoursPreference {
  enabled: boolean;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
}

export function SettingsToggles({
  notificationTopicsInitial,
  quietHoursInitial,
  isNativeInitial,
}: {
  notificationTopicsInitial: NotificationTopicPreferences;
  quietHoursInitial: QuietHoursPreference;
  isNativeInitial: boolean;
}) {
  // Seeded from the server (the fog_native_client cookie) to avoid an
  // SSR/hydration flash, then corrected below from Capacitor's own check -
  // covers a plain (non-Capacitor) mobile browser, where that cookie was
  // never set.
  const [isNative, setIsNative] = useState(isNativeInitial);

  const [locationGranted, setLocationGranted] = useState(false);
  const [notificationGranted, setNotificationGranted] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [topics, setTopics] = useState(notificationTopicsInitial);
  const [quietHours, setQuietHours] = useState(quietHoursInitial);
  const [detectedTimeZone, setDetectedTimeZone] = useState<string | null>(null);
  const [activePrimer, setActivePrimer] = useState<PrimerScreen>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Computed fresh from Capacitor rather than read from the `isNative`
    // state, so this corrects a mismatch with the server-seeded prop (e.g.
    // a plain, non-Capacitor mobile browser, where the fog_native_client
    // cookie was never set) without needing a separate effect just to patch
    // that state up.
    const actual = Capacitor.isNativePlatform();
    const strategies = getStrategies(actual);

    // Seed location/notification/biometric-availability/biometric-enabled
    // from the on-device cache immediately, so these toggles don't flash
    // "off" while the real checks below are still resolving - each is
    // corrected the moment its real check resolves, a few lines down.
    Promise.resolve().then(() => {
      if (cancelled) return;
      const cached = readSettingsCache();
      if (cached?.locationGranted !== undefined) setLocationGranted(cached.locationGranted);
      if (cached?.notificationGranted !== undefined) setNotificationGranted(cached.notificationGranted);
      if (actual && cached?.biometricAvailable !== undefined) setBiometricAvailable(cached.biometricAvailable);
      if (actual && cached?.biometricEnabled !== undefined) setBiometricEnabled(cached.biometricEnabled);
    });
    writeSettingsCache({ quietHours: quietHoursInitial });
    // Biometric sign-in is a per-device preference (FR-2.7): read straight
    // from this device's own store, never from the account - a device that
    // has never turned it on reads as not-enabled, same as a fresh install.
    if (actual) {
      LocalSettingsCache.getBiometricEnabled()
        .then((result) => {
          if (cancelled) return;
          setBiometricEnabled(result.enabled);
          writeSettingsCache({ biometricEnabled: result.enabled });
        })
        .catch(() => {
          if (!cancelled) setBiometricEnabled(false);
        });
    }
    // Retry any optimistic write (see lib/settings-sync.ts) that didn't get
    // confirmed before this page was last left - e.g. the app closed right
    // after a toggle, before its POST got a response.
    flushPendingSettingsWrites();

    strategies.location.isGranted().then((granted) => {
      if (cancelled) return;
      setLocationGranted(granted);
      writeSettingsCache({ locationGranted: granted });
    });
    strategies.notification.isGranted().then((granted) => {
      if (cancelled) return;
      setNotificationGranted(granted);
      writeSettingsCache({ notificationGranted: granted });
      setIsNative((prev) => (prev === actual ? prev : actual));
      // Native self-manages its own FCM topic subscriptions on every mount
      // (see reconcile-notification-topics.ts); a web device has no
      // client-side subscribeToTopic API, so its reconciliation happens
      // server-side instead - see /api/notifications/topics and
      // /api/notifications/device-token.
      if (actual) reconcileNotificationTopics(notificationTopicsInitial);
    });
    if (actual) {
      BiometricPrimer.isAvailable()
        .then((result) => {
          if (cancelled) return;
          setBiometricAvailable(result.available);
          writeSettingsCache({ biometricAvailable: result.available });
        })
        .catch(() => {
          if (!cancelled) setBiometricAvailable(false);
        });
    }

    // Deferred to a microtask (rather than called synchronously here) to
    // match this effect's existing async-setState convention. Purely for
    // display - see the "Times shown in ..." caption below - the value
    // actually persisted to the account is synced separately, on every
    // dashboard mount, by components/TimeZoneSync.tsx.
    Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        setDetectedTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
      } catch {
        setDetectedTimeZone(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [notificationTopicsInitial, quietHoursInitial]);

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
    // Biometric sign-in is a per-device preference (FR-2.7): written
    // straight to this device's own store, never to the account - there is
    // no server round trip to retry, unlike the optimistic-write settings
    // below.
    setBiometricEnabled(false);
    writeSettingsCache({ biometricEnabled: false });
    try {
      await LocalSettingsCache.setBiometricEnabled({ enabled: false });
    } catch {
      setError("Couldn't save that setting. Try again.");
    }
  }

  async function handleLocationAllow() {
    const granted = await getStrategies(isNative).location.requestPermission();
    setLocationGranted(granted);
    setActivePrimer(null);
  }

  async function handleNotificationAllow() {
    setError(null);
    const granted = await getStrategies(isNative).notification.requestPermission();
    setNotificationGranted(granted);
    setActivePrimer(null);

    if (!granted) {
      // requestPermission() resolves "denied" both when the user just
      // clicked Block AND when the browser already had this origin blocked
      // from before - in the latter case there's no dialog at all, so
      // without this the modal just silently closes with no explanation.
      setError(
        "Notification permission wasn't granted. If your browser didn't show a prompt, notifications may already be blocked for this site - check your browser's site settings.",
      );
      return;
    }
    // The mount-time reconcile in the effect above ran before permission was
    // granted and no-opped - this is the first point the device is actually
    // able to hold FCM subscriptions, so apply the persisted preference now
    // rather than waiting for a future mount to catch up. Native only - see
    // the comment in the mount effect above.
    if (isNative) {
      reconcileNotificationTopics(topics);
    }
  }

  async function handleTopicToggle(category: NotificationCategory, next: boolean) {
    setError(null);
    if (isNative) {
      try {
        await NotificationTopics[next ? "subscribe" : "unsubscribe"]({ category });
      } catch {
        setError("Couldn't update that notification setting. Try again.");
        return;
      }
    }
    // Optimistic from here: reflect the change immediately, then persist in
    // the background - see lib/settings-sync.ts. For a web device, the
    // actual FCM (un)subscription happens server-side as part of that POST
    // - see /api/notifications/topics.
    setTopics((prev) => ({ ...prev, [category]: next }));
    const ok = await writeSettingOptimistically(`topic:${category}`, "/api/notifications/topics", {
      category,
      enabled: next,
    });
    if (!ok) setError("Couldn't save that notification setting - we'll keep retrying.");
  }

  async function saveQuietHours(next: QuietHoursPreference) {
    setError(null);
    // Optimistic: reflect this immediately and persist in the background -
    // see lib/settings-sync.ts.
    setQuietHours(next);
    writeSettingsCache({ quietHours: next });
    const ok = await writeSettingOptimistically("quiet-hours", "/api/notifications/quiet-hours", { ...next });
    if (!ok) setError("Couldn't save that notification setting - we'll keep retrying.");
  }

  function handleQuietHoursToggle(next: boolean) {
    saveQuietHours({ ...quietHours, enabled: next });
  }

  function handleQuietHoursTimeChange(field: "startTime" | "endTime", value: string) {
    if (!value) return;
    saveQuietHours({ ...quietHours, [field]: value });
  }

  async function handleBiometricAllow() {
    const result = await BiometricPrimer.authenticate({ title: "Confirm it's you" });
    setActivePrimer(null);
    if (!result.success) {
      setError(result.error ?? "Biometric check did not succeed.");
      return;
    }
    // The hardware authentication above has to be awaited (there's no way
    // to turn this on before it succeeds), but from here on it's a direct
    // write to this device's own store (FR-2.7), never the account - no
    // server round trip to retry.
    setBiometricEnabled(true);
    writeSettingsCache({ biometricEnabled: true });
    try {
      await LocalSettingsCache.setBiometricEnabled({ enabled: true });
    } catch {
      setError("Couldn't save that setting. Try again.");
    }
  }

  return (
    <div className="flex flex-col">
      <Toggle
        label="Notifications"
        caption={
          notificationGranted
            ? "Managed in your device settings."
            : "Get updates on claims, renewals and offers."
        }
        checked={notificationGranted}
        disabled={notificationGranted}
        onChange={handleNotificationToggle}
      />
      {/*
        Captions below are customer-facing copy - DRAFT, needs Compliance
        sign-off before ship (financial promotion under FOGIL's FCA
        authorisation), particularly Promotions/Feeds which are
        marketing-adjacent. This also covers the Quiet hours copy further
        below - it's scheduling UX rather than marketing content, but is
        still customer-facing text needing sign-off before use. Its wording
        deliberately says "reminder notifications", not "notifications" -
        quiet hours only gates the per-user journey-reminder push, not the
        Promotions/Feeds broadcasts above, which are sent to every
        subscribed device in one topic-wide call with no way to hold back
        an individual recipient's copy.
      */}
      {notificationGranted && (
        <div className="ml-6 flex flex-col border-l border-slate-800 pl-4">
          <Toggle
            label="Essentials"
            caption="Claims updates, policy and renewal reminders."
            checked={topics.essentials}
            onChange={(next) => handleTopicToggle("essentials", next)}
          />
          <Toggle
            label="Promotions"
            caption="Offers and marketing updates."
            checked={topics.promotions}
            onChange={(next) => handleTopicToggle("promotions", next)}
          />
          <Toggle
            label="Feeds"
            caption="Travel tips and destination content."
            checked={topics.feeds}
            onChange={(next) => handleTopicToggle("feeds", next)}
          />
        </div>
      )}
      <Toggle
        label="Quiet hours"
        caption="Pause reminder notifications during set hours, every day."
        checked={quietHours.enabled}
        onChange={handleQuietHoursToggle}
      />
      {quietHours.enabled && (
        <div className="ml-6 flex flex-col gap-3 border-l border-slate-800 py-3 pl-4">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            Starts
            <Input
              type="time"
              value={quietHours.startTime}
              onChange={(event) => handleQuietHoursTimeChange("startTime", event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            Ends
            <Input
              type="time"
              value={quietHours.endTime}
              onChange={(event) => handleQuietHoursTimeChange("endTime", event.target.value)}
            />
          </label>
          {detectedTimeZone && <p className="text-xs text-slate-400">Times shown in {detectedTimeZone}.</p>}
        </div>
      )}
      <Toggle
        label="Location"
        caption={
          locationGranted ? "Managed in your device settings." : "Personalised guides and offers when you're abroad."
        }
        checked={locationGranted}
        disabled={locationGranted}
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
