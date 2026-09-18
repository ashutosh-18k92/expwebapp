"use client";

import { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import {
  BiometricPrimer,
  LocalSettingsCache,
  NotificationTopics,
  type NotificationCategory,
} from "@/lib/native-permissions";
import { reconcileNotificationTopics } from "@/lib/reconcile-notification-topics";
import { registerDevice } from "@/lib/register-device";
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
  // This specific device's own stored preference (Mongo, on its `devices`
  // row - SRS FR-2.9) - what the "Notifications" toggle actually shows and
  // is freely switchable, unlike the raw OS/browser permission bit (there's
  // no separate `notificationGranted` state to compare it against - turning
  // this on always goes through the primer/requestPermission() regardless
  // of the current permission state, see handleNotificationToggle). Not
  // known server-side ahead of render (SSR has no way to know which of this
  // account's devices is loading the page), so this always starts at false
  // and is corrected once ensureDeviceToken resolves in the mount effect,
  // same shape as locationGranted above.
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
  }, [notificationsEnabled]);
  // This device's own push token, once known - set by ensureDeviceToken
  // below. A plain ref, not state: nothing renders from it directly, it's
  // only ever read from inside handlers/effects, never during render.
  const deviceTokenRef = useRef<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [topics, setTopics] = useState(notificationTopicsInitial);
  // Kept in sync with `topics` so refreshPermissionState below - re-run
  // later from the visibility/focus listeners, not just at mount - always
  // reconciles against whatever the customer's topic choices actually are
  // right now, not a stale closure over this component's first-mount value.
  const topicsRef = useRef(topics);
  useEffect(() => {
    topicsRef.current = topics;
  }, [topics]);
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

    // Split out because it needs to run more than once: the OS/browser
    // permission underneath these two toggles can be granted or revoked at
    // any time this screen is sitting open - most commonly, the customer
    // backgrounds this app to open the device's own Settings and flips a
    // permission there, then switches straight back here without ever
    // navigating away from (and back to) this screen. Neither platform
    // pushes that change to us, so nothing re-runs the checks below on its
    // own unless we ask for it - see the visibility/focus listeners further
    // down.
    function refreshPermissionState() {
      strategies.location.isGranted().then((granted) => {
        if (cancelled) return;
        setLocationGranted(granted);
        writeSettingsCache({ locationGranted: granted });
      });
      strategies.notification.isGranted().then(async (granted) => {
        if (cancelled) return;
        setIsNative((prev) => (prev === actual ? prev : actual));
        // Native self-manages its own FCM topic subscriptions on every mount
        // (see reconcile-notification-topics.ts); a web device has no
        // client-side subscribeToTopic API, so its reconciliation happens
        // server-side instead - see /api/notifications/topics and
        // /api/notifications/device-token. Reads topicsRef rather than the
        // notificationTopicsInitial prop directly, since this can run again
        // long after mount, after the customer's own in-session toggle
        // changes have moved `topics` away from that initial snapshot.
        if (actual) reconcileNotificationTopics(topicsRef.current);
        // Learns whether THIS device already has notificationsEnabled set
        // (SRS FR-2.9) - a no-op if OS/browser permission was never
        // granted, in which case there's no token to register and nothing
        // to learn (the toggle correctly stays at its default off).
        // Awaited (not fire-and-forget) so the reconciliation check right
        // below always sees this settle first - see ensureDeviceToken's own
        // comment for the race this guards against.
        const device = await ensureDeviceToken();
        if (cancelled) return;
        // This device's own stored preference still says on, but the
        // OS/browser permission underneath it is gone - most commonly, the
        // customer revoked it from the device's own Settings while this
        // screen stayed open. Bring the stored preference back in line with
        // reality rather than leaving it claiming something that can no
        // longer happen; also the one thing that stops
        // fog-push-notification-service from still trying to send this
        // specific device pushes it can never deliver. Silent - no error
        // surfaced for this background correction; a failed write is simply
        // retried by flushPendingSettingsWrites on the next mount, same as
        // any other optimistic write.
        if (!granted && device?.notificationsEnabled) {
          persistNotificationsEnabled(false, device.token);
        }
      });
    }
    refreshPermissionState();
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

    // `visibilitychange` covers both a plain browser tab switch and this
    // app's own native Android WebView, which (being a real Chromium
    // WebView, same as the localStorage settings cache above relies on)
    // fires this on the host Activity's own pause/resume; `focus` is kept
    // alongside it as a second signal for whichever browser/WebView
    // combination doesn't fire one of the two reliably - both handlers are
    // idempotent, so a rare double-fire just re-runs the same read-only
    // checks harmlessly.
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") refreshPermissionState();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", refreshPermissionState);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", refreshPermissionState);
    };
    // This effect is deliberately mount-only (see topicsRef/
    // notificationsEnabledRef above for the same reasoning) - adding
    // ensureDeviceToken here would re-run the whole effect, re-attaching
    // listeners and re-running every permission check, on every render.
    // Its only real dependency is `isNative`, the same state every other
    // handler in this file already reads via getStrategies(isNative)
    // outside of an effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationTopicsInitial, quietHoursInitial]);

  function closePrimer() {
    setActivePrimer(null);
  }

  function handleLocationToggle(next: boolean) {
    if (next) setActivePrimer("location");
  }

  // Shared by the toggle's own onChange, the primer's Allow flow, and the
  // background reconciliation above - always sets local state immediately
  // (optimistic) and persists in the background via lib/settings-sync.ts,
  // against this device's own row (SRS FR-2.9), keyed by its token. Never
  // shows an error itself; callers that represent a direct user action
  // decide whether to surface one from the return value, since the
  // background reconciliation call deliberately doesn't.
  async function persistNotificationsEnabled(next: boolean, token: string): Promise<boolean> {
    setNotificationsEnabled(next);
    return writeSettingOptimistically("notifications-enabled", "/api/notifications/enabled", {
      token,
      enabled: next,
    });
  }

  // Returns this device's already-known token (deviceTokenRef) and its
  // last-resolved notificationsEnabled, or fetches and registers a token if
  // it doesn't have one yet - registration is what creates the `devices`
  // row /api/notifications/enabled needs to already exist. Resolves to
  // null if OS/browser permission isn't granted (no token to get) or
  // registration fails.
  //
  // Returns notificationsEnabled directly from the just-awaited result
  // (not read back via notificationsEnabledRef) deliberately: a caller
  // that awaits this and then immediately checks the ref (as
  // refreshPermissionState's reconciliation below does) can't rely on
  // React having already run the effect that syncs the ref from state by
  // the time the await resolves - the notification.isGranted() check and
  // this function's own HTTP round trip resolve independently, in no
  // guaranteed order, so a ref-read immediately after this resolves could
  // still see a stale value. Not yet verified against this exact race on a
  // real device - see SRS.md.
  async function ensureDeviceToken(): Promise<{ token: string; notificationsEnabled: boolean } | null> {
    if (deviceTokenRef.current) {
      return { token: deviceTokenRef.current, notificationsEnabled: notificationsEnabledRef.current };
    }
    const token = await getStrategies(isNative).notification.getDeviceToken();
    if (!token) return null;
    try {
      const result = await registerDevice(token, isNative ? "native" : "web");
      deviceTokenRef.current = token;
      setNotificationsEnabled(result.notificationsEnabled);
      return { token, notificationsEnabled: result.notificationsEnabled };
    } catch {
      return null;
    }
  }

  async function handleNotificationToggle(next: boolean) {
    setError(null);
    if (next) {
      // Always goes through the primer, even when OS/browser permission is
      // already granted - tapping "Enable Notifications" there still runs
      // handleNotificationAllow's full flow (requestPermission(), then
      // ensureDeviceToken()). A version of this that skipped straight to
      // ensureDeviceToken() when already granted was tried and reverted the
      // same day: with nothing else in that path showing any UI, a
      // customer toggling this on saw no dialog, no confirmation, nothing
      // at all - visibly worse than always showing the primer, even in the
      // case where requestPermission() itself has nothing new to show.
      setActivePrimer("notifications");
      return;
    }
    // Turning off - there is no way to programmatically revoke OS/browser
    // permission, so this can persist straight away.
    const device = await ensureDeviceToken();
    if (!device) {
      setError("Couldn't save that notification setting. Try again.");
      return;
    }
    const ok = await persistNotificationsEnabled(false, device.token);
    if (!ok) setError("Couldn't save that notification setting - we'll keep retrying.");
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
    const device = await ensureDeviceToken();
    if (!device) {
      setError("Couldn't save that notification setting. Try again.");
      return;
    }
    const ok = await persistNotificationsEnabled(true, device.token);
    if (!ok) setError("Couldn't save that notification setting - we'll keep retrying.");
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
        caption="Get updates on claims, renewals and offers."
        checked={notificationsEnabled}
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
      {notificationsEnabled && (
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
