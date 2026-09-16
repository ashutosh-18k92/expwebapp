# FOG Experience Platform: Software Requirements Specification

- Doc ID: FOG-SRS-EXP-01
- Version: 0.3 (Sections 1-8 reconstructed from implementation history; Section 9 was forward-specified, then built against that spec in the same pass)
- Status: Draft, unreviewed
- Systems in scope: `exp-webapp`, `fog-push-notification-service`, `fog-mobile-app`
- Brands: Agua, Bounce, Centrd (each its own deployment on Crayeres)

## About this document

This lists the notification, settings, permissions and navigation features built across the three repositories, written as requirements rather than a change log. Sections 1 to 8 were reconstructed after the fact from an implementation session, not authored ahead of the work they describe, and none of it has been reviewed by engineering or Compliance. Treat every "Implemented" status as a claim to verify against the current codebase before relying on it, and every quoted customer-facing string as DRAFT pending sign-off, not approved copy. Section 9 is the exception: it was specified ahead of implementation, then implemented against that spec. Its "Implemented, awaiting on-device check" status means the code, unit tests and cross-brand island build all pass, but nothing in it has run on a real Android or iOS device or emulator yet - this environment has no JDK/Android SDK/Xcode toolchain to do that with.

FOGIL (company 17037311) is the FCA-authorised entity behind the Agua, Bounce and Centrd brands. FOG is pre-launch: nothing in this document has run against live customers or production traffic.

## Contents

1. [Notification delivery infrastructure](#1-notification-delivery-infrastructure)
2. [Account settings and preferences](#2-account-settings-and-preferences)
3. [Client-side performance and reliability](#3-client-side-performance-and-reliability)
4. [Application structure and navigation](#4-application-structure-and-navigation)
5. [Journeys and notification history](#5-journeys-and-notification-history)
6. [Multi-brand architecture](#6-multi-brand-architecture)
7. [Native app support](#7-native-app-support)
8. [Non-functional requirements](#8-non-functional-requirements)
9. [Offline biometric gate parity](#9-offline-biometric-gate-parity)
10. [Known limitations and deferred work](#10-known-limitations-and-deferred-work)

---

## 1. Notification delivery infrastructure

`fog-push-notification-service`: scheduling, targeting and gating of every push a brand sends, one database silo per brand.

### FR-1.1 Per-brand, per-category broadcast jobs

Status: Implemented

Each brand publishes to its own FCM topics: one brand-wide topic and three opt-in category topics. A scheduled job exists for every brand and category combination, each independently enabled and scheduled.

Acceptance criteria:
- Twelve broadcast jobs exist: {all, essentials, promotions, feeds} times {agua, bounce, centrd}
- A job refuses to run if its title or body copy is unset, so it cannot fire with placeholder text
- Each job is disabled by default and requires an explicit enable flag

Files: `src/jobs/*-broadcast.job.ts`, `src/config/env.ts`

### FR-1.2 Brand-scoped FCM topic migration

Status: Implemented

Topics are namespaced per brand (`<brand>-all`, `<brand>-essentials`, and so on) instead of one topic shared across all brands, so a broadcast can never reach another brand's customers regardless of subscription state.

Acceptance criteria:
- Native app subscribes each install to its own brand's `-all` topic on launch
- No shared cross-brand topic remains anywhere in the system

Repos: `fog-mobile-app`, `exp-webapp`, `fog-push-notification-service`. Reference: `MainActivity.subscribeToTopics`.

### FR-1.3 Journey reminder job

Status: Implemented

A targeted, per-user push sent a configurable number of days before a customer's scheduled journey date, one job instance per brand against that brand's own database.

Acceptance criteria:
- Matches journeys by calendar-day window against `journeyDate`, idempotent via `reminderSentAt`
- Dispatched only if the user's essentials preference is on, defaulting on for a user doc that predates the field
- Sends to every device token registered against the user, not a single "latest device"

Files: `src/jobs/journey-reminder.factory.ts`

### FR-1.4 Per-device delivery isolation

Status: Implemented

A single bad or expired device token must never stop delivery to a user's other devices, or halt processing of the next recipient in a run.

Acceptance criteria:
- Every per-token send is individually caught and logged, never allowed to reject the surrounding batch
- A per-recipient exception still allows the run to continue to the next recipient

### FR-1.5 Shared dispatch decision layer

Status: Implemented

Every job that pushes to a customer (journey reminders, all twelve broadcast jobs, and the test-only joke job) consults one shared function before sending, rather than each job carrying its own copy of dispatch rules.

Acceptance criteria:
- One function decides send or withhold per recipient, given their quiet-hours state and the notification's category
- Never gates the in-app record, only the push alert
- Structured so a future cross-cutting rule (for example a global mute) has one place to be added

Files: `src/lib/notification-policy.ts`

### FR-1.6 Quiet hours delivery gate

Status: Implemented

A push due while its recipient is inside their own configured quiet-hours window, in their own local time, is withheld for that run. It is not queued for later delivery: the in-app record is written immediately regardless, and the push is simply not re-attempted.

Acceptance criteria:
- Evaluated in the recipient's IANA time zone, converted from UTC at send time
- Handles an overnight window (for example 22:00 to 07:00) correctly across midnight
- Falls back to Europe/London if the recipient's time zone is missing or unresolvable
- A category on the bypass list ignores the gate entirely; the list ships empty, reserved for a future time-critical category

Files: `src/lib/quiet-hours.ts`

### FR-1.7 Per-recipient broadcast dispatch

Status: Implemented

Broadcast jobs no longer send one topic-wide FCM message. A topic broadcast has no way to exclude a single subscriber, which made per-recipient rules like quiet hours impossible to apply to them. Each broadcast now enumerates every user its category reaches and sends per device token instead.

Acceptance criteria:
- Recipients are computed directly from account preferences (`notificationTopics`), not from FCM's own topic membership
- Recipient lookups and sends are processed in bounded batches, not unbounded concurrency
- A device without a registered token, or a user matching no category, is skipped without error

Trade-off: a broadcast is now one Mongo query plus up to one FCM call per subscribed device, not a single FCM call. Acceptable at current scale; a materially larger cost at real production volume.

Files: `src/jobs/broadcast.factory.ts`

### FR-1.8 Universal in-app notification recording

Status: Implemented

Every notification this service dispatches (targeted or broadcast, real or test) is written to the recipient's in-app notification record, so the exp-webapp bell reflects it even for a user with no registered device or a failed push.

Acceptance criteria:
- Recording happens unconditionally, before the per-recipient send or withhold decision
- Applies identically to the test-only joke job, for end-to-end verification

---

## 2. Account settings and preferences

`exp-webapp`: the customer's own settings are the single source of truth, kept consistent across every device they use.

### FR-2.1 Notification topic preferences

Status: Implemented

A customer opts in or out of Essentials, Promotions and Feeds independently. The three toggles appear indented under the main Notifications toggle, and only once notification permission is actually granted.

Files: `components/SettingsToggles.tsx`

### FR-2.2 Quiet hours preference

Status: Implemented

One daily quiet-hours window (start time, end time), the same across every device a customer uses. No day-of-week variation. Internationalised via the browser or OS's own time input, plus a plain-text readout of the currently detected time zone for transparency.

Acceptance criteria:
- Stored as local wall-clock start and end time, evaluated against a separately-tracked time zone (see FR-1.6)
- Copy scoped deliberately to "reminder notifications", not "notifications": it does not cover broadcasts

Note: customer-facing copy is DRAFT and requires Compliance sign-off before use, as a financial promotion under FOGIL's FCA authorisation.

Files: `app/api/notifications/quiet-hours`

### FR-2.3 Topic subscription reconciliation

Status: Implemented

A device's actual FCM topic subscriptions are reconciled against the account's stored preferences at sign-in and on every app open, so a reinstall, a new device or drift between platforms cannot silently desynchronise from what the customer actually chose.

Acceptance criteria:
- Runs again the moment notification permission is granted, closing the gap where a fresh install starts with permission off
- Account preference is authoritative; device state is always brought into line with it, never the reverse

Files: `components/TopicSync.tsx`, `lib/reconcile-notification-topics.ts`

### FR-2.4 Multi-device registration

Status: Implemented

A customer's phone and browser can both hold a live push registration simultaneously; one device is never overwritten by another.

Acceptance criteria:
- Each device is a distinct record keyed by its own push token, tagged native or web

Files: `lib/db.ts` (`DeviceDoc`)

### FR-2.5 Cross-platform permission strategy

Status: Implemented

Notification and location permission handling is written once against a common interface, with a native implementation (Capacitor plugins) and a browser implementation (Web APIs) behind it, selected automatically by platform.

Files: `lib/permission-strategies/`

### FR-2.6 Server-side web push subscription

Status: Implemented

A browser has no client API to subscribe itself to an FCM topic, unlike native. exp-webapp performs this on the browser's behalf via the Firebase Admin SDK whenever a preference changes or a new web device registers.

Files: `lib/notification-topics-admin.ts`

### FR-2.7 Biometric sign-in preference

Status: Implemented

A customer can turn biometric sign-in on or off from Settings, gated behind an actual hardware authentication check before it is switched on.

Files: `app/api/auth/biometric/`

---

## 3. Client-side performance and reliability

`exp-webapp`: the app should feel instant on a device it has already talked to, and never lose a customer's intent to a bad connection or a well-timed back button.

### FR-3.1 On-device settings cache

Status: Implemented, awaiting on-device check

The last-known state of biometric availability and enabled, location granted, notification granted, and quiet hours is cached on-device, so Settings can paint instantly instead of flashing to "off" while the real checks are still resolving.

Acceptance criteria:
- The cache is always corrected by the real check the moment it resolves; it is a perceived-latency aid, never the source of truth
- A value already available synchronously (for example biometric preference or quiet hours, from the signed-in session) is never overwritten by a possibly stale cached one

Files: `lib/settings-cache.ts`

### FR-3.2 Optimistic settings updates

Status: Implemented

Toggling a setting updates the screen and the on-device cache immediately. The network write happens afterward, without the customer waiting on it.

Files: `components/SettingsToggles.tsx`

### FR-3.3 Durable background settings sync

Status: Implemented

A settings write that has not been confirmed saved yet, because the customer navigated away or the request failed outright, is retried automatically the next time a relevant page opens, rather than being lost.

Acceptance criteria:
- A newer write to the same field supersedes an older unconfirmed one; a stale value is never replayed over a fresher one
- Retries are never capped or abandoned
- Requests are sent with `keepalive` so a genuine page or app close does not cut them off mid-flight

Files: `lib/settings-sync.ts`, `components/SettingsSync.tsx`

### FR-3.4 Session-scoped biometric unlock

Status: Implemented, awaiting on-device check

Once a customer has confirmed biometrics for the current app session, navigating back to the biometric-gated Home screen does not prompt again. A full app restart, or signing out, still requires a fresh unlock.

Acceptance criteria:
- Unlock state lives in memory for the session, not on disk; it cannot silently survive an app restart
- Signing out clears it, so a different account signing in next is never handed someone else's unlock

Note: this covers the online web app only. See [Section 9](#9-offline-biometric-gate-parity) for the equivalent behaviour offline, which cannot reuse this store as-is because bundled island pages are separate WebView loads, not routes within this app.

Files: `lib/biometric-gate-store.ts`, `components/BiometricGate.tsx`

---

## 4. Application structure and navigation

`exp-webapp`: a consistent shell and a legible information architecture across every screen.

### FR-4.1 Persistent back and dashboard navigation

Status: Implemented

Every page carries the same back control and a direct link to the dashboard, so a customer is never stranded on a screen with no way out.

Files: `components/AppHeader.tsx`

### FR-4.2 Card-based dashboard hub

Status: Implemented

The post-login landing page presents Settings, User Account, Currency Converter and Manage Journeys as cards, rather than mixing utilities directly into the landing page itself.

Files: `app/dashboard/page.tsx`

### FR-4.3 Dedicated Currency Converter and Manage Journeys pages

Status: Implemented

Currency conversion and journey management each get their own page, reachable from the dashboard, instead of living inline on another screen.

Files: `app/currency-converter/`, `app/journeys/`

### FR-4.4 User Account page

Status: Implemented

A dedicated page for the customer's own account details, separate from Settings.

Files: `app/account/page.tsx`

### FR-4.5 Shared component and icon system

Status: Implemented

Interactive controls (switches, inputs) are drawn from shadcn/ui, and icons throughout the app come from a single icon set, replacing ad hoc, one-off implementations.

Files: `components/ui/`, `lucide-react`

---

## 5. Journeys and notification history

`exp-webapp`: the customer-facing record that the reminder infrastructure in Section 1 exists to serve.

### FR-5.1 Journey scheduling

Status: Implemented

A customer records an upcoming journey's date and time, which the reminder job (FR-1.3) later matches against.

Files: `components/JourneyForm.tsx`

### FR-5.2 In-app notification history

Status: Implemented

A bell icon on the dashboard lists every notification recorded for the signed-in customer (see FR-1.8), with the ability to dismiss one entry or clear all.

Files: `components/NotificationBell.tsx`

---

## 6. Multi-brand architecture

Agua, Bounce and Centrd are treated as fully separate deployments from the data layer up, not one shared install with a brand field.

### FR-6.1 Brand-specific deployment and database silo

Status: Implemented

Each brand is its own build, its own domain and its own database, selected by a single build-time identifier. No customer record carries a brand field, because no database ever holds more than one brand's customers.

Note: chosen over a shared database with a per-record brand field, for stronger isolation and simpler per-brand operations as the number of brands grows.

Files: `lib/brand.ts`, `BRAND_ID`

### FR-6.2 Per-brand job instantiation

Status: Implemented

Journey reminder and broadcast logic is written once as a shared factory and instantiated once per brand, each against that brand's own database connection, rather than duplicated three times over.

Files: `*.factory.ts`, `config/mongodb.ts` (fog-push-notification-service)

---

## 7. Native app support

`fog-mobile-app`: the thin native surface the web layer above depends on.

### FR-7.1 Native shell detection

Status: Implemented

exp-webapp can tell whether it is running inside the native shell or a plain browser, via a header set only by the native cold-start request and mirrored into a cookie for subsequent server-side reads.

Reference: `X-FOG-Native-Client`

### FR-7.2 Native permission and token plugins

Status: Implemented

Custom Capacitor plugins expose device push token retrieval, biometric availability and authentication, location and notification permission priming, and FCM topic subscribe and unsubscribe to the web layer.

Reference: `PushTokenPlugin`, `NotificationTopicsPlugin`

---

## 8. Non-functional requirements

Constraints that apply across every requirement above, not features in their own right.

Regulatory and conduct:
- FOGIL is a non-advised broker acting as agent of the customer. No feature in this document recommends a product or assesses suitability.
- Any customer-facing copy introduced above is a financial promotion under FOGIL's FCA authorisation: marked DRAFT, and held for Compliance sign-off before enabling the job or screen that sends it.
- No feature described here has run against live customers or production traffic. FOG is pre-launch.

Data and infrastructure:
- No message broker was introduced for quiet hours or dispatch gating. Both are implemented against the existing MongoDB and cron architecture, deliberately, to avoid infrastructure disproportionate to current scale.
- Testing throughout this build phase used disposable accounts and journeys against a shared development database, cleaned up after each verification pass, never real customer or health data.

---

## 9. Offline biometric gate parity

`exp-webapp`, `fog-mobile-app`, `islands`: extends the biometric gate (FR-3.4) so it behaves the same whether the app is showing the remote web app or the bundled offline islands (Section 7), instead of only applying online. Raised because the gate today is baked into `exp-webapp` and is never reached when the native shell falls back to the islands, so a customer with biometrics enabled gets no gate at all offline.

Islands are unauthenticated by design and run on a separate origin from the web app (`capacitor://localhost` on iOS, `file:///android_asset/public/` on Android), sharing no cookies or web storage with it (`islands/src/island-bridge.js`). Every requirement below follows from that constraint: nothing here can be read from the web app's localStorage or session, only from something native.

### FR-9.1 Cross-origin biometricsEnabled sync

Status: Implemented, awaiting on-device check

The customer's `biometricEnabled` preference (FR-2.7), read into the online gate from the signed-in session, is mirrored into a native, disk-backed cache the offline islands can read. This is a new cache, kept deliberately separate from the existing on-device settings cache (FR-3.1), which is browser localStorage and unreachable from the islands' origin, and which this feature must not depend on or desynchronise from.

Acceptance criteria:
- A new Capacitor plugin, `LocalSettingsCache` (Android: `SharedPreferences`-backed; iOS: `UserDefaults`-backed), exposes a get/set for the biometric-enabled flag, callable both from the web app and from island pages (via `Capacitor.nativePromise` on Android file:// pages, per the existing pattern in `islands/src/island-bridge.js`)
- exp-webapp writes the current value into the cache whenever it is known: on every load of the biometric-gated Home page, and immediately after a successful `/api/auth/biometric/enable` or `/disable` call
- A device that has never synced a value (fresh install, or never yet been online) reads as not-enabled, the same default a fresh account has online
- The cache holds only this one flag today. It is not a general cross-origin settings channel; nothing else writes to it until a future requirement asks for that explicitly

Files: `template/android/app/src/main/java/com/forestoaksgroup/agua/LocalSettingsCachePlugin.java`, `template/ios/App/App/LocalSettingsCachePlugin.swift` (fog-mobile-app); `lib/native-permissions.ts`, `lib/sync-biometric-cache.ts`, `components/BiometricCacheSync.tsx`, `app/page.tsx`, `components/SettingsToggles.tsx`, `app/register/page.tsx` (exp-webapp)

### FR-9.2 Process-scoped offline unlock state

Status: Implemented, awaiting on-device check

Each island page is a separate full WebView load (`FogShellPlugin.loadLocal`), not a route within one running app, so the online gate's in-memory JS "unlocked this session" store (FR-3.4) does not survive navigating from one island to another. Offline unlock state instead lives natively, in memory, for the life of the running app process.

Acceptance criteria:
- Unlocking on any one island is honoured on every other island opened afterwards in the same app session; the customer is not re-prompted on each one
- The flag is held in native memory only, never written to disk; an app restart always re-locks, matching FR-3.4's "session, not disk" rule
- Signing out of the online web app also clears this native flag, so a different account signing in afterwards is never handed someone else's unlock, mirroring `BiometricGate.tsx`'s existing `resetUnlocked()` call on logout

Files: `markUnlocked`/`isUnlocked`/`resetUnlock` on the same `LocalSettingsCachePlugin` as FR-9.1, Android and iOS (fog-mobile-app); `components/BiometricGate.tsx` calls the native reset alongside the existing JS reset on logout (exp-webapp)

### FR-9.3 Offline biometric gate UI

Status: Implemented, awaiting on-device check

Every bundled island applies the same lock screen as the online gate before showing its content, when the synced flag (FR-9.1) says biometrics are enabled and the process is not already unlocked (FR-9.2).

Acceptance criteria:
- Visual and copy parity with the online gate ("Confirm it's you", "Use your fingerprint or face to unlock this page", "Unlock with biometrics"), styled from the existing island token/CSS system
- No "Log out instead" control offline, by product decision: there is no bundled login page and no network to sign out over, so it is omitted rather than shown disabled
- Availability is checked the same way as online (`BiometricPrimer.isAvailable`, via the island's native-bridge call path); a device reporting unsupported or unavailable hardware shows the island's content directly rather than locking the customer out, mirroring the online gate's `"unsupported"` fallback
- A successful `BiometricPrimer.authenticate` call reveals the page's content and marks the process-scoped unlock (FR-9.2); a failed or cancelled attempt leaves the lock screen in place with an inline error, the same as online

Note: this reuses existing, still-DRAFT gate copy rather than introducing new customer-facing strings. It remains a financial-promotion-adjacent surface pending Compliance sign-off, same as the copy it is copied from (see FR-2.2's note).

Files: `islands/src/biometric-gate-core.js` (pure decision logic, node:test-covered), `islands/src/biometric-gate.js` (DOM/bridge controller), `islands/src/biometric-gate.css`, included by `offline.html`, `emergency.html`, `phrasebook.html`, `sounds.html`

### FR-9.4 Uniform gating across all offline content

Status: Implemented, awaiting on-device check

The gate applies the same way to every bundled island, including Emergency help, rather than exempting any one of them, by explicit product decision made when this requirement was scoped.

Acceptance criteria:
- `offline.html`, `emergency.html`, `phrasebook.html` and `sounds.html` all run the FR-9.3 check on load
- No island is reachable without passing the gate when the synced flag says biometrics are enabled, including Emergency help
- A device that has never synced a `biometricEnabled` value is never gated (FR-9.1), so this only affects a customer who opted in online

Flagged for Compliance/product review before build: `offline.html`'s own header comment records Emergency help as "the reason the offline shell exists" for a customer with no connectivity. Gating it uniformly means a customer offline with failed, unenrolled or unavailable biometrics has no route to emergency contact information from this shell. This was raised during scoping and decided in favour of uniform, predictable behaviour over an exemption; recorded here as a considered trade-off, not an oversight, and worth Compliance revisiting given the safety angle.

Files: `islands/src/offline.html`, `islands/src/emergency.html`, `islands/src/phrasebook.html`, `islands/src/sounds.html`

---

## 10. Known limitations and deferred work

Raised and consciously set aside during this build phase, not overlooked.

- **Quiet hours delivery is suppress-only, not queued.** A withheld push is not re-attempted after the window ends. A fuller design adding a durable delayed-delivery queue and a per-brand drain job was scoped but not built, in favour of the simpler behaviour for this iteration.
- **The quiet-hours bypass list ships empty.** The mechanism to exempt a notification category from quiet hours exists, but no category is on it yet, and there is no customer-facing control to manage it. It is a fixed backend policy today.
- **Settings still depend on a server round-trip to open.** The on-device cache (FR-3.1) removes the visible flash while a page's own checks resolve; it does not remove the Settings page's own server-rendered data fetch. Doing so was considered and deliberately deferred as a larger, riskier restructuring.
- **Several features are unverified on real hardware.** FR-3.1 and FR-3.4 were verified by type-checking, lint and server-rendering checks only; neither has been exercised on an actual Android device with real biometric hardware. FR-9.1 to FR-9.4 (Section 9) add to this list: `exp-webapp`'s side was verified the same way (type-check, lint, a dev-server smoke test of the Home page) and `fog-mobile-app`'s island side by its full node:test suite and a successful island build for all three brands, but the two new native plugin files (`LocalSettingsCachePlugin.java`/`.swift`) have not been compiled or run - this environment has no JDK/Android SDK/Xcode toolchain - so the actual SharedPreferences/UserDefaults reads, the real biometric prompt round-trip from an island page, and the gate's on-screen appearance are all unverified until someone runs this on an emulator or device.
- **A Chrome-specific notification permission report was diagnosed, not root-caused.** Firefox worked, Chrome did not respond to a permission request in one production report. This was traced to browser or profile-level permission state (an already-blocked origin, or Chrome's quiet-permission UI) rather than a defect in this codebase, and a clearer in-app error message was added regardless.
