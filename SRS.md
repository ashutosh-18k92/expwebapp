# FOG Experience Platform: Software Requirements Specification

- Doc ID: FOG-SRS-EXP-01
- Version: 0.5 (Sections 1-8 reconstructed from implementation history; Sections 9-10 were forward-specified, then built and partly device-verified against that spec in the same pass; Section 11 was forward-specified and built web-only in the same pass, with its native/offline portion deferred rather than built)
- Status: Draft, unreviewed
- Systems in scope: `exp-webapp`, `fog-push-notification-service`, `fog-mobile-app`
- Brands: Agua, Bounce, Centrd (each its own deployment on Crayeres)

## About this document

This lists the notification, settings, permissions and navigation features built across the three repositories, written as requirements rather than a change log. Sections 1 to 8 were reconstructed after the fact from an implementation session, not authored ahead of the work they describe, and none of it has been reviewed by engineering or Compliance. Treat every "Implemented" status as a claim to verify against the current codebase before relying on it, and every quoted customer-facing string as DRAFT pending sign-off, not approved copy. Sections 9 and 10 are the exception: both were specified ahead of implementation, then implemented and, for the parts noted "verified on device", exercised end to end on a live Android emulator against a real deployed environment and a real MongoDB - not merely type-checked or unit-tested. Section 11 was specified ahead of implementation too, but only its web scope (`exp-webapp`) was built in this pass; its native/offline scope was deliberately deferred as follow-up work, not built and not verified on any device.

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
9. [Unified biometric gateway](#9-unified-biometric-gateway)
10. [Native session persistence](#10-native-session-persistence)
11. [Customer policy documents](#11-customer-policy-documents)
12. [Known limitations and deferred work](#12-known-limitations-and-deferred-work)

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

## 9. Unified biometric gateway

`exp-webapp`, `fog-mobile-app`: one biometric check gates the whole app - the remote web app and the bundled offline islands alike - instead of the gate only ever living inside `exp-webapp` and never being reached when the native shell falls back to the islands.

This section's shape changed twice during scoping, recorded here rather than silently overwritten:
1. First built as a per-island web gate (every bundled island ran its own "Confirm it's you" check once loaded).
2. Redesigned as a native check that runs on Android *before* the app decides online vs offline, so neither surface loads - even hidden - before the customer has proven it's them; the per-island web gate was then removed as redundant, and the business requirement narrowed to "offline pages stay open to everyone, authenticated or not" once that native check has passed or did not apply. FR-9.3/FR-9.4 below record the removed first shape for the audit trail; FR-9.5/FR-9.6 describe what is actually built today.

### FR-9.1 Cross-origin biometricsEnabled sync

Status: Implemented, verified on device (Android emulator, against a live deployed environment)

The customer's `biometricEnabled` preference (FR-2.7), read into the online gate from the signed-in session, is mirrored into a native, disk-backed cache that native code can read before any WebView content exists. This is a new cache, kept deliberately separate from the existing on-device settings cache (FR-3.1), which is browser localStorage and unreachable from native code, and which this feature must not depend on or desynchronise from.

Acceptance criteria:
- A Capacitor plugin, `LocalSettingsCache` (Android: `SharedPreferences`-backed; iOS: `UserDefaults`-backed), exposes a get/set for the biometric-enabled flag
- exp-webapp writes the current value into the cache whenever it is known: on every load of the biometric-gated Home page, and immediately after a successful `/api/auth/biometric/enable` or `/disable` call
- A device that has never synced a value (fresh install, or never yet been online) reads as not-enabled, the same default a fresh account has online
- The cache holds only this one flag today. It is not a general cross-origin settings channel; nothing else writes to it until a future requirement asks for that explicitly

Verified end to end on an Android emulator: registering, enabling biometrics, then a full app force-stop and relaunch correctly showed the native gate (FR-9.5) on the next cold start, confirming the synced value survived a process restart as designed.

Files: `template/android/app/src/main/java/com/forestoaksgroup/agua/LocalSettingsCachePlugin.java`, `template/ios/App/App/LocalSettingsCachePlugin.swift` (fog-mobile-app); `lib/native-permissions.ts`, `lib/sync-biometric-cache.ts`, `components/BiometricCacheSync.tsx`, `app/page.tsx`, `components/SettingsToggles.tsx`, `app/register/page.tsx` (exp-webapp)

### FR-9.2 Process-scoped unlock state, shared across every surface

Status: Implemented, verified on device

One process-lifetime "unlocked this app process" flag is the single source of truth for whether this device is currently unlocked, read and written by the native gate (FR-9.5) and the online gate (FR-9.6) alike, so unlocking once via either surface is honoured by the other for the rest of that running process.

Acceptance criteria:
- The flag is held in native memory only, never written to disk; an app restart always re-locks, matching FR-3.4's "session, not disk" rule
- Signing out of the online web app also clears this native flag, so a different account signing in afterwards is never handed someone else's unlock, mirroring `BiometricGate.tsx`'s existing `resetUnlocked()` call on logout

Verified end to end: unlocking the native gate (FR-9.5) with a fingerprint, then loading the remote origin, landed directly on the Dashboard with no second "Confirm it's you" prompt from the online gate - confirming FR-9.6's read of this same flag works as designed.

Files: `markUnlocked`/`isUnlocked`/`resetUnlock` on `LocalSettingsCachePlugin`, Android and iOS (fog-mobile-app); `components/BiometricGate.tsx` calls the native reset alongside the existing JS reset on logout (exp-webapp)

### FR-9.3 Offline biometric gate UI (removed)

Status: Removed - superseded by FR-9.5

Originally: every bundled island applied its own lock screen before showing its content. Removed once the native pre-connectivity gate (FR-9.5) made a per-island check redundant - a device that reaches an island has, by construction, already either passed the native gate or never needed to (biometrics disabled). Kept here, not deleted from this document, as the record of what was built and then intentionally taken back out; the code (`islands/src/biometric-gate.js`, `-core.js`, `.css`) was deleted rather than left dead.

### FR-9.4 Uniform gating across all offline content (removed)

Status: Removed - superseded by FR-9.5, and by the corrected business requirement that offline pages stay open to everyone

Originally: the island gate applied the same way to every bundled island, including Emergency help, and this document flagged that decision for Compliance/product review given Emergency help's safety role. That review is now moot: islands carry no gate of their own at all, so Emergency help (and every other island) is unconditionally reachable once the app is running, regardless of authentication or biometric state - resolving the flagged concern by removing the mechanism it was raised against, not by deciding it either way.

### FR-9.5 Native pre-connectivity biometric gate (Android only)

Status: Implemented, verified on device (Android emulator, Pixel_7a AVD)

Before `MainActivity` decides whether to load the remote origin or the bundled offline shell, it checks the synced `biometricEnabled` flag (FR-9.1) and the shared unlock state (FR-9.2). If biometrics are enabled and the process is not already unlocked, a native lock screen (mirroring the online gate's look) blocks both the automatic remote load Capacitor already queued and the shell's own connectivity decision until the customer authenticates.

Acceptance criteria:
- A true no-op when biometrics are disabled (the default): no extra native view, no extra load, verified on-device
- Allows the device's own PIN/pattern/password as a fallback alongside biometrics (`BIOMETRIC_STRONG | DEVICE_CREDENTIAL`), by explicit product decision, so a customer whose fingerprint/face repeatedly fails is not locked out of the app entirely
- Fails open (shows content without gating) when the device has neither usable biometric hardware nor a secure device credential, mirroring the removed island gate's and the online gate's existing fallback behaviour
- On success, marks the shared unlock flag (FR-9.2) and proceeds with the connectivity decision exactly as before this feature existed

iOS has no equivalent - see Section 11 and `fog-mobile-app`'s README "Known gaps". The only biometric check on iOS today is the online gate (FR-9.6); nothing gates a cold start into the bundled islands there, same as Android now that FR-9.3/FR-9.4 are removed.

Files: `template/android/app/src/main/java/com/forestoaksgroup/agua/NativeBiometricGate.java` (new), `MainActivity.java`, `LocalSettingsCachePlugin.java`, `BiometricPrimerPlugin.java` (all fog-mobile-app, Android only); new layout/drawable resources under `template/android/app/src/main/res/`

### FR-9.6 Online gate reads the shared unlock flag

Status: Implemented, verified on device

`components/BiometricGate.tsx` checks `LocalSettingsCache.isUnlocked()` before falling back to its own availability check, and marks that same flag on a successful unlock - closing the gap where the online gate previously only ever knew about its own separate in-memory JS store (`lib/biometric-gate-store.ts`), never the native flag FR-9.5 also uses.

Acceptance criteria:
- A device already unlocked natively (FR-9.5) renders the online gate's children immediately, with no prompt
- A successful online unlock marks the shared flag, not just the local JS store
- No bridge / plugin unreachable falls through to the pre-existing availability-check behaviour unchanged

Files: `components/BiometricGate.tsx`

---

## 10. Native session persistence

`exp-webapp`: independent of biometrics entirely - a sliding-window renewal for native app sessions, so an actively-returning native customer is never forced to re-authenticate purely because of elapsed time since their original login.

### FR-10.1 Sliding-window session renewal (native only)

Status: Implemented, verified against a local MongoDB and the real `proxy.ts` request path (not yet against the deployed environment)

The `fog_session` cookie's base TTL is unchanged (90 days native, 7 days browser). What's new: an actively-returning native session keeps resetting to a fresh 90 days on return visits, instead of hard-expiring 90 days after the original login. Browser sessions are completely untouched - they never reach this logic at all.

Acceptance criteria:
- Renewal is keyed off the existing `SessionDoc.expiresAt` field (no new tracking field): a session renews once less than a day of its 90-day life remains, bounding writes to at most once per session per calendar day of active use
- A renewal resets `expiresAt` to a fresh 90 days, updates `users.lastLoginAt`, and re-issues the `fog_session` cookie (same token, fresh `Max-Age`) - necessary because the client's own copy of the cookie enforces expiry independently of the server-side record
- `createSession()` (login/register) is unchanged: still issues 90-day native / 7-day browser sessions immediately, with no artificial extension at creation time
- A device that has never been native-flagged, or a browser session, never triggers a Mongo read for this at all

Verified directly against a local dev server (`pnpm dev`) and this repo's own local MongoDB, not the deployed environment: registered a native session, forced its `expiresAt` to within the renewal window, confirmed a subsequent request extended it back to a fresh 90 days and updated `lastLoginAt`, and confirmed an immediate follow-up request did not renew again (throttle held).

Files: `lib/db.ts` (`lastLoginAt?: Date` on `UserDoc`), `lib/auth/session.ts` (`renewNativeSessionIfStale`), `proxy.ts`

Flagged, not resolved: `proxy.ts`'s own guidance cautions against relying on shared modules/globals "in optimized cases deployed to your CDN." This app's exact deployment topology (single Node process vs. an isolated edge pool for Proxy) is not confirmed - if Proxy ever runs isolated from the main app server, the shared Mongo client cache (`lib/db.ts`) may need its own connection pool. Flag for whoever owns the deployment decision.

---

## 11. Customer policy documents

`exp-webapp`: lets a signed-in customer see and download their own policy documents. This section covers the web scope only, built in this pass. A native/offline scope was discussed during requirements and deliberately deferred rather than built - see [Section 12](#12-known-limitations-and-deferred-work).

### FR-11.1 Policy metadata store

Status: Implemented

Each policy document has a metadata record in a new `policies` MongoDB collection, linked to the customer by `userId`, independent of the document file itself.

Acceptance criteria:
- Stores at minimum a display name and an active/inactive flag, plus optionally a policy/reference number, cover type, start date and end date
- Indexed by `userId` so a customer's own records are looked up directly, never by scanning

Note: there is no admin/back-office authoring flow for these records yet - see [Section 12](#12-known-limitations-and-deferred-work). `scripts/seed-policies.mjs` is a one-off dev helper that upserts records for the two test accounts used to build this feature, not a production ingestion path.

Files: `lib/db.ts` (`PolicyDoc`), `scripts/seed-policies.mjs`

### FR-11.2 My policies dashboard tab and screen

Status: Implemented

A "My policies" card on the dashboard opens a dedicated screen listing every policy document belonging to the signed-in customer: display name, active/inactive status, and cover type/dates where recorded.

Files: `app/policies/page.tsx`, `app/dashboard/page.tsx`

### FR-11.3 No-policy state messaging

Status: Implemented

A customer with no policy records sees a plain message stating they are not currently covered under any policy with the firm, rather than an empty list.

Note: this copy is DRAFT and requires Compliance sign-off before use, as a financial promotion under FOGIL's FCA authorisation. It states an absence of cover as a plain fact and does not recommend a product or assess suitability.

Files: `app/policies/page.tsx`

### FR-11.4 Document download to device (web)

Status: Implemented

From the My Policies screen, a customer can save a policy document to their device using the browser's own download mechanism, with the saved file named after the policy's display name rather than its stored file name.

Acceptance criteria:
- Only policies belonging to the signed-in customer appear on their own screen, so a customer only ever sees a download link to their own document under normal use

Note: this does not add a server-side, per-request ownership check on the file itself - see the storage-location limitation in [Section 12](#12-known-limitations-and-deferred-work). This is the accepted state for the current testing phase, not a resolved design.

Files: `app/policies/page.tsx`

### FR-11.5 Native offline availability (deferred, not built)

Status: Deferred - scoped but not built

Making a downloaded policy document available inside the native app while offline, via a new tab on the islands (bundled offline shell) landing page identical in design to the online My Policies screen, was discussed as part of this requirement and deliberately deferred as follow-up work, not built in this pass.

Recorded for the follow-up piece of work:
- Islands run as static bundles baked into `fog-mobile-app` at build time, with no filesystem access, no download/cache plugin, and no shared cookies/session with the signed-in web app today (see Section 9's description of island isolation). Reading a customer-downloaded file back from an island therefore needs a new native Capacitor plugin to persist and re-read cached files, not just web-side work.
- Cached policy files should be scoped to the signed-in account and cleared on logout or account switch, mirroring FR-9.2's "signing out clears the shared unlock flag" behaviour, so a shared or handed-down device never shows one customer's downloaded policy documents to the next person who signs in.

Files: none yet (`fog-mobile-app`)

---

## 12. Known limitations and deferred work

Raised and consciously set aside during this build phase, not overlooked.

- **Quiet hours delivery is suppress-only, not queued.** A withheld push is not re-attempted after the window ends. A fuller design adding a durable delayed-delivery queue and a per-brand drain job was scoped but not built, in favour of the simpler behaviour for this iteration.
- **The quiet-hours bypass list ships empty.** The mechanism to exempt a notification category from quiet hours exists, but no category is on it yet, and there is no customer-facing control to manage it. It is a fixed backend policy today.
- **Settings still depend on a server round-trip to open.** The on-device cache (FR-3.1) removes the visible flash while a page's own checks resolve; it does not remove the Settings page's own server-rendered data fetch. Doing so was considered and deliberately deferred as a larger, riskier restructuring.
- **FR-3.1 and FR-3.4 remain unverified on real hardware.** Both were checked by type-checking, lint and server-rendering only; neither has been exercised on an actual Android device with real biometric hardware. Unlike Section 9's Android work, no emulator/device pass has been done for these two specifically.
- **Section 9's Android build has an emulator pass, not a physical-device or iOS pass.** FR-9.1, FR-9.2, FR-9.5 and FR-9.6 were verified end to end on an Android emulator (Pixel_7a AVD) against a live deployed environment: registration, enabling biometrics, a full process restart correctly re-triggering the native gate, and the online gate correctly recognising an already-unlocked device with no second prompt. Not yet checked: a physical Android device, the `DEVICE_CREDENTIAL` (PIN/pattern) fallback path specifically (only the fingerprint path was exercised), the logout-clears-native-flag path, and anything on iOS (FR-9.5 is Android-only by design - see `fog-mobile-app`'s README "Known gaps").
- **FR-10.1's native session renewal is verified against a local dev server and this repo's own local MongoDB, not the deployed environment.** The renewal logic was exercised directly over HTTP with a simulated native header/cookie against `pnpm dev` and the database configured in `.env.local`; it has not yet been triggered by a real native app cold-launch/page-load request, nor checked against whatever database the deployed environment actually uses.
- **A Chrome-specific notification permission report was diagnosed, not root-caused.** Firefox worked, Chrome did not respond to a permission request in one production report. This was traced to browser or profile-level permission state (an already-blocked origin, or Chrome's quiet-permission UI) rather than a defect in this codebase, and a clearer in-app error message was added regardless.
- **Policy documents are served from Next.js's `public/` static directory, with no per-request authentication check on the file itself.** A policy PDF is technically fetchable by anyone who has, or guesses, its URL, regardless of who is signed in. This was a deliberate choice for the current testing phase against two dummy test accounts, not an oversight, and needs to be revisited (moving files to a private, server-only directory served through an authenticated route) before any real customer document is stored this way.
- **Native offline availability for downloaded policy documents was scoped but not built.** FR-11.5 records what a follow-up piece of work needs: a new `fog-mobile-app` Capacitor plugin to persist and re-read cached files, and a new "My Policies" tab on the islands offline landing page. The web-only download flow (FR-11.4) ships first; nothing offline-capable exists yet.
- **Policy metadata has no admin/back-office authoring flow.** Records are written directly into MongoDB today, via `scripts/seed-policies.mjs` for the two test accounts built against. That is a dev convenience, not viable once there is a genuine operational process for adding a customer's policy documents.
