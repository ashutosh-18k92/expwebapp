# FOG Experience Platform: Software Requirements Specification

- Doc ID: FOG-SRS-EXP-01
- Version: 1.0 (Sections 1-8 reconstructed from implementation history; Sections 9-10 were forward-specified, then built and partly device-verified against that spec in the same pass, though FR-2.7/FR-9.1 were later revised (2026-09-17) to a device-only biometric preference, and FR-9.7 added on top (2026-09-18) to bridge the resulting native page-load gap - both revisions device-verified; Section 11 was forward-specified and built across three passes - web download, native/offline, then a same-day revision replacing the download with email delivery (a password-protection addition to that revision was specified, built and withdrawn the same day, before verification - see FR-11.6); Section 12 is forward-specified only, not yet built - planned for a later session)
- Status: Draft, unreviewed
- Systems in scope: `exp-webapp`, `fog-push-notification-service`, `fog-mobile-app`
- Brands: Agua, Bounce, Centrd (each its own deployment on Crayeres)

## About this document

This lists the notification, settings, permissions and navigation features built across the three repositories, written as requirements rather than a change log. Sections 1 to 8 were reconstructed after the fact from an implementation session, not authored ahead of the work they describe, and none of it has been reviewed by engineering or Compliance. Treat every "Implemented" status as a claim to verify against the current codebase before relying on it, and every quoted customer-facing string as DRAFT pending sign-off, not approved copy. Sections 9 and 10 are the exception: both were specified ahead of implementation, then implemented and, for the parts noted "verified on device", exercised end to end on a live Android emulator against a real deployed environment and a real MongoDB - not merely type-checked or unit-tested. Section 11 was specified ahead of implementation too: its web scope (`exp-webapp`) was built first, and its native/offline scope followed in a second pass against `fog-mobile-app`, confirmed working end to end on an Android emulator. A same-day third pass then revised FR-11.4 to email delivery once browser downloads were judged unsafe for this kind of document; a password-protection addition to that same pass (FR-11.6, IronPDF) was specified and built but withdrawn the same day, before real credentials existed to verify it, so it is recorded as removed rather than implemented. FR-11.4 itself builds cleanly but is honestly marked as blocked on real Resend credentials rather than device-verified. Section 12 is specified ahead of implementation and not yet built at all - captured here as agreed requirements for a later session, not a claim of anything working.

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
12. [Planned: live connectivity handling and uninstall data hygiene](#12-planned-live-connectivity-handling-and-uninstall-data-hygiene)
13. [Known limitations and deferred work](#13-known-limitations-and-deferred-work)

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
- Structured so a future cross-cutting rule (for example a frequency cap) has one place to be added

Note: briefly extended 2026-09-18 with a `notificationsEnabled` "global mute" check, as the account-wide master toggle this acceptance criteria's third bullet had anticipated - see FR-2.9. Reverted the same day, before that shipped anywhere: FR-2.9 was itself revised, the same day, to a per-device setting rather than an account-wide one (a customer's phone and browser can each have their own on/off state), so the check moved out of this per-recipient function entirely, to a per-device filter on `devices.notificationsEnabled` right before each `sendToToken` call in `broadcast.factory.ts`/`journey-reminder.factory.ts` instead. This function is back to quiet-hours only, as it was before that day.

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

A customer opts in or out of Essentials, Promotions and Feeds independently. The three toggles appear indented under the main Notifications toggle, and only once that toggle is switched on (see FR-2.9 - this is the device's own stored preference, not a live read of OS/browser permission).

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

Note: this per-device record is also where the Settings screen's "Notifications" toggle now lives (`notificationsEnabled`, FR-2.9) - a direct consequence of this design, since a customer's phone and browser needing genuinely separate registrations means they can genuinely need separate on/off states too.

Files: `lib/db.ts` (`DeviceDoc`)

### FR-2.5 Cross-platform permission strategy

Status: Implemented

Notification and location permission handling is written once against a common interface, with a native implementation (Capacitor plugins) and a browser implementation (Web APIs) behind it, selected automatically by platform.

Fixed 2026-09-18 - a real gap, not a pre-existing limitation: the Notifications and Location toggles on the Settings screen only ever re-ran the real `isGranted()` check once, on mount. Each check does correctly read live OS/browser state, not a cache, so a fresh visit to Settings always showed the true permission state - but a customer who backgrounds this app to revoke a permission from the device's own Settings app, then switches straight back into this already-open screen (never navigating away from it and back), saw the toggle stay stuck on "enabled" indefinitely: nothing re-ran the check without a fresh mount, and the on-device cache (FR-3.1) that seeds the toggle's initial paint had no way to hear about the change either. Fixed by re-running the same `isGranted()` check whenever this screen regains focus, via both a `visibilitychange` listener (fires on a plain browser tab switch, and on this app's own native Android WebView on the host Activity's pause/resume, since it's a real Chromium WebView) and a `window focus` listener kept alongside it as a second signal, in case one of the two isn't fired reliably by a given browser/WebView combination. The reconciliation this triggers on native (`reconcileNotificationTopics`, FR-2.3) was changed at the same time to read the customer's current topic choices from a ref rather than the `notificationTopicsInitial` prop, since it can now run long after mount, after an in-session toggle change has moved the live value away from that initial snapshot.

Acceptance criteria:
- Revoking notification or location permission from the OS/browser while Settings is already open and in the foreground, then returning focus to it without a full page reload, flips the corresponding toggle back to off on its own
- Re-granting a permission the same way flips it back on the same way, including re-applying the customer's topic preferences (native)
- The on-device cache (FR-3.1) is corrected by the same re-check, so the next mount's instant paint isn't seeded from the stale value either

Not yet verified on device: confirmed by type-check and lint only. The assumption that `visibilitychange` fires reliably inside `fog-mobile-app`'s Android WebView on Activity pause/resume (rather than only in a plain browser tab) has not been exercised against a real device or emulator - see [Section 13](#13-known-limitations-and-deferred-work).

Files: `lib/permission-strategies/`, `components/SettingsToggles.tsx`

### FR-2.6 Server-side web push subscription

Status: Implemented

A browser has no client API to subscribe itself to an FCM topic, unlike native. exp-webapp performs this on the browser's behalf via the Firebase Admin SDK whenever a preference changes or a new web device registers.

Files: `lib/notification-topics-admin.ts`

### FR-2.7 Biometric sign-in preference

Status: Implemented (revised 2026-09-17 - see note)

A customer can turn biometric sign-in on or off from Settings, gated behind an actual hardware authentication check before it is switched on.

Note: originally an account-wide preference (`UserDoc.biometricEnabled` in MongoDB, written via `/api/auth/biometric/enable`/`disable`). Revised 2026-09-17: biometric sign-in is a per-device convenience setting, not an account-wide one - a customer's fingerprint enrolment on one phone has no bearing on a different phone, or a browser, signed into the same account - so it now lives only on the device. See FR-9.1 for the full record of what changed.

Acceptance criteria:
- Stored only in the native on-device store (`LocalSettingsCache`, Android `SharedPreferences` / iOS `UserDefaults`) - no Mongo field, no server round trip to read or write it
- A device that has never turned this on reads as not-enabled, including a second device signing into an account that already has it enabled elsewhere

Files: `lib/native-permissions.ts`, `components/SettingsToggles.tsx`, `components/BiometricGate.tsx`, `app/register/page.tsx`

### FR-2.8 Customer profile: first name and date of birth

Status: Implemented

A customer's first name and date of birth, collected at registration and editable afterwards from the Account page. Originally added to derive the password on an emailed policy document (FR-11.6); that feature was withdrawn the same day (2026-09-17), before real credentials existed to verify it, but these two fields were kept by product decision. No feature currently reads them back.

Acceptance criteria:
- Required fields on the registration form; existing accounts created before these fields existed can fill them in from Account
- Stored as a plain string and a UTC-midnight `Date` respectively (`UserDoc.firstName`/`dateOfBirth`), both optional in the schema only because pre-existing accounts predate them

Files: `lib/db.ts`, `app/register/page.tsx`, `app/api/auth/register/route.ts`, `app/account/page.tsx`, `components/ProfileForm.tsx`, `app/api/account/profile/route.ts`

### FR-2.9 Notifications master toggle and device-permission reconciliation

Status: Implemented (fixes a regression, then revised same day - see notes)

The Settings screen's top-level "Notifications" toggle is this specific device's own stored preference (`DeviceDoc.notificationsEnabled`), freely switchable on or off at any time, rather than a read-only mirror of the OS/browser permission grant.

Note (2026-09-18, first pass): the toggle had drifted into being disabled once permission was granted, showing "Managed in your device settings." instead of a real control - there was never a stored field behind it at all, only the live permission check. Fixed as a reported bug (the customer should be able to turn this on or off from the app, synced to MongoDB, independent of whatever the OS/browser permission happens to be), not a new ask. First built as `UserDoc.notificationsEnabled`, an account-wide field.

Note (2026-09-18, same day, revised): moved from the account to the device the same day, before the account-wide version had been used anywhere - a customer's phone and browser can each have their own OS/browser permission state, so one shared account-level flag couldn't correctly represent both (a device without permission would otherwise force the *account's* flag off, silently turning off notifications for the customer's *other* devices too). `preferences.notificationTopics`/`preferences.quietHours` (FR-2.1/FR-2.2) stayed account-wide - they're genuinely the same across every device, unlike this - and moved from flat `UserDoc` fields into a nested `UserDoc.preferences` object in the same pass, so the "same across every device" group and the per-device settings read as two distinct things. A one-off `scripts/migrate-user-preferences.mjs` moved the dev database's three existing test accounts across, was run once against it, confirmed correct by reading the migrated documents back, and was then deleted - kept here as the record of how that data got to its current shape, not as a script anyone still needs to run.

Acceptance criteria:
- `DeviceDoc.notificationsEnabled` (optional, defaults to off - never backfilled from a device's existing OS/browser permission state, by product decision, since this is a brand-new field with no prior customer having ever seen or set it) persisted via `POST /api/notifications/enabled`, taking `{ token, enabled }` and matching the `devices` row by `{_id: token, userId}` so one account can never flip a device registered to a different one
- Because this now lives on `devices`, not `users`, the Settings screen has no synchronous (SSR) way to know it ahead of render, unlike `preferences.notificationTopics`/`preferences.quietHours` - it starts at off and is corrected once this device's own token is known, the same shape as the live OS/browser permission checks (FR-2.5) it sits alongside
- `lib/register-device.ts`'s `registerDevice()` (shared with `components/DeviceTokenSync.tsx`, which already registered this device's token on every dashboard mount) both upserts the `devices` row and returns its current `notificationsEnabled`, so Settings learns this device's own value the moment it can get a token, with no separate round trip
- Turning it on always goes through the existing "Turn on notifications" primer first, regardless of whether OS/browser permission happens to already be granted, and only persists once the primer's `requestPermission()` call succeeds and a device token is obtained/registered. A version of this that skipped straight past the primer to `ensureDeviceToken()` when permission was already granted was tried and reverted the same day (2026-09-18): with nothing else in that path showing any UI, a customer toggling this on in that state saw no dialog, no confirmation, nothing at all - reported as a regression against the previous behaviour, where toggling on always showed the primer regardless of permission state

Note (2026-09-18, same day, second revision): the direct consequence of the above - there is no longer a `notificationGranted` state tracked in `SettingsToggles.tsx` at all, since its only reader was the now-removed skip check. The raw OS/browser permission result is still read every mount/visibility-regain (FR-2.5) and still drives the reconciliation-to-off logic below, just as a local value inside that check, not a piece of component state.
- Turning it off persists immediately - there is no way to programmatically revoke the OS/browser permission itself, so this is purely this device's own record of intent
- Essentials/Promotions/Feeds (FR-2.1) stay visible only while this master toggle is on, rather than while OS/browser permission is granted - their own (account-wide) preferences are untouched by this toggle either way, so switching it back on later doesn't reset them
- Reconciliation: whenever the live permission re-check (FR-2.5's mount/visibility/focus-triggered `refreshPermissionState`) finds the OS/browser permission no longer granted while this device's own preference is still on, it's set back to off and persisted via the same API route, silently (no error shown for this background correction) - this is also what stops fog-push-notification-service from continuing to try to send this specific device pushes it can no longer deliver (see that repo's `broadcast.factory.ts`/`journey-reminder.factory.ts`, which filter `devices` by `notificationsEnabled: true` directly, not through the shared `decideDispatch` function - see FR-1.5's note)

Files: `lib/db.ts` (`DeviceDoc.notificationsEnabled`, `UserDoc.preferences`), `app/api/notifications/enabled/route.ts`, `app/api/notifications/device-token/route.ts`, `lib/register-device.ts` (new), `app/api/notifications/topics/route.ts`, `app/api/notifications/quiet-hours/route.ts`, `app/api/auth/register/route.ts`, `app/settings/page.tsx`, `app/dashboard/page.tsx`, `components/SettingsToggles.tsx`, `components/DeviceTokenSync.tsx`. `scripts/migrate-user-preferences.mjs` did the one-off data migration and was deleted once run and verified - see the note above.

---

## 3. Client-side performance and reliability

`exp-webapp`: the app should feel instant on a device it has already talked to, and never lose a customer's intent to a bad connection or a well-timed back button.

### FR-3.1 On-device settings cache

Status: Implemented, awaiting on-device check

The last-known state of biometric availability and enabled, location granted, notification granted, and quiet hours is cached on-device, so Settings can paint instantly instead of flashing to "off" while the real checks are still resolving.

Acceptance criteria:
- The cache is always corrected by the real check the moment it resolves; it is a perceived-latency aid, never the source of truth
- A value already available synchronously (for example quiet hours, from the signed-in session) is never overwritten by a possibly stale cached one

Note: biometric preference was originally an example of a value "already available synchronously from the signed-in session" - it no longer is. Since FR-2.7's 2026-09-17 revision, it is read the same way biometric availability already was: seeded from this cache, then corrected asynchronously from the `LocalSettingsCache` plugin, never from the server.

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

### FR-4.6 Build version display

Status: Implemented (revised same day - see note)

The Settings screen shows the running web build as plain text - `package.json`'s semantic version plus when this code was last built - so a support conversation or a bug report can pin down which build a customer is actually looking at.

Note: originally an incrementing build number, hand-committed to the repo like a mobile app's versionCode. Revised the same day, before this shipped anywhere, to a build timestamp instead - simpler, and needs nobody to remember to commit anything.

Acceptance criteria:
- `scripts/write-build-version.mjs` stamps `build-version.json` with the current time, wired into both the `dev` and `build` npm scripts ahead of `next dev`/`next build` - the Settings screen always reflects when the running process was actually built/started, including in local dev
- `build-version.json` is gitignored, not committed - regenerated fresh on every run, so there's nothing meaningful to track in git
- Formatted in `en-GB` with a fixed `Europe/London` time zone, not the deploying host's own locale/zone, so the displayed time doesn't depend on where this happens to be deployed
- Read directly off disk from the Settings page (a Server Component) rather than threaded through `next.config.ts`'s env-inlining, so this needs no separate client-bundling step; falls back to "unknown" rather than failing the page if `build-version.json` is missing (e.g. `next dev`/`next build` invoked directly, bypassing the package.json script)

Note: this is plain build/version metadata, not a claim about the product or its cover - it doesn't need the financial-promotion DRAFT/Compliance-sign-off treatment the rest of this Settings screen's customer-facing copy does.

Files: `build-version.json` (gitignored), `scripts/write-build-version.mjs`, `lib/build-version.ts`, `app/settings/page.tsx`, `package.json`

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

### FR-9.1 Native, on-device biometric-enabled store (originally: cross-origin biometricsEnabled sync)

Status: Implemented (revised 2026-09-17, same FR number - see note on verification)

Superseded design, kept for the audit trail: this was originally a sync mechanism. The customer's `biometricEnabled` preference, stored in MongoDB and read into the online gate from the signed-in session, was mirrored into a native, disk-backed cache so native code could read it before any WebView content exists.

Revised 2026-09-17 (see FR-2.7): biometric sign-in was judged a per-device convenience setting, not an account-wide one. `UserDoc.biometricEnabled` was removed from MongoDB entirely, along with `/api/auth/biometric/enable`/`disable`. The native `LocalSettingsCache` store this FR introduced is unchanged in mechanism - same Capacitor plugin, same disk-backed storage (Android `SharedPreferences`, iOS `UserDefaults`) - but changes role: no longer a cache mirroring an account preference, it is now the sole, authoritative record of the preference, written directly by Settings and registration immediately after a hardware check succeeds, never synced from anywhere.

Acceptance criteria:
- A Capacitor plugin, `LocalSettingsCache`, exposes a get/set for the biometric-enabled flag
- `components/SettingsToggles.tsx` and `app/register/page.tsx` write directly to this store - on enable, only after `BiometricPrimer.authenticate()` succeeds; on disable, immediately - with no server request involved either way
- A device that has never turned this on reads as not-enabled, the same default a fresh install had before this revision, now also true of a second device signing into an account that already has it enabled elsewhere
- The store holds only this one flag today (plus the separate unlock flag, FR-9.2). It is not a general cross-origin settings channel; nothing else writes to it until a future requirement asks for that explicitly

Note: removing the account-level copy also removes its self-correction property. Previously, a wrongly-flipped on-device value would be corrected at the next online sync against Mongo; now the device's own copy is the only copy, so nothing corrects it if it's wrong - recorded as a residual risk in `fog-mobile-app`'s README (`LocalSettingsCache` accepted-surfaces entry) and in [Section 13](#13-known-limitations-and-deferred-work).

Verified end to end, before this revision: registering, enabling biometrics, then a full app force-stop and relaunch correctly showed the native gate (FR-9.5) on the next cold start, confirming the value survived a process restart as designed. Not re-verified on device since the revision - the plugin mechanism is unchanged, but the new direct-write call sites (`SettingsToggles.tsx`, `app/register/page.tsx`) have only been type-checked, linted and built, not exercised on a device - see Section 13.

Files: `template/android/app/src/main/java/com/forestoaksgroup/agua/LocalSettingsCachePlugin.java`, `template/ios/App/App/LocalSettingsCachePlugin.swift` (fog-mobile-app); `lib/native-permissions.ts`, `components/SettingsToggles.tsx`, `components/BiometricGate.tsx`, `app/register/page.tsx` (exp-webapp)

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

Before `MainActivity` decides whether to load the remote origin or the bundled offline shell, it checks the on-device `biometricEnabled` flag (FR-9.1) and the shared unlock state (FR-9.2). If biometrics are enabled and the process is not already unlocked, a native lock screen (mirroring the online gate's look) blocks both the automatic remote load Capacitor already queued and the shell's own connectivity decision until the customer authenticates.

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

Fixed 2026-09-18 - a real regression, not a pre-existing gap: FR-2.7/FR-9.1's device-only revision (2026-09-17) had `BiometricGate.tsx` compute its initial render state from `Capacitor.isNativePlatform()` directly, synchronously. That call answers differently on the server (always "web", no bridge - Node has none) than on an actual native client during hydration, so for any real native session the server-rendered children and the client's first hydration render disagreed on whether to show anything at all. React's recovery from that structural mismatch showed both the server-painted content and the client's re-render stacked in the live DOM - reported as the dashboard, and separately the Register/Sign-in buttons, visibly appearing twice on a cold app open, resolving to normal after any subsequent in-app navigation (which involves no hydration). Fixed by moving the native/not-native answer to a value that is genuinely identical on both sides - the `fog_native_client` cookie via `lib/platform.ts`'s `isNativeClient()`, passed down as an `isNativeInitial` prop - with the real `Capacitor.isNativePlatform()` call confined to a `useEffect` (client-only, runs after hydration, never part of the server/client comparison), the same pattern `components/SettingsToggles.tsx` already used for this exact reason. Verified on device: cold app opens after the fix showed the buttons/dashboard exactly once, repeatedly, including on a fresh install.

Files: `components/BiometricGate.tsx`, `app/page.tsx`

### FR-9.7 Native page-loading transition after biometric unlock (Android only)

Status: Implemented, verified on device (Android emulator, Pixel_7a AVD)

Between a successful native biometric unlock (FR-9.5) and the remote origin's first paint, `MainActivity` had shown nothing: it resets the WebView to `about:blank` before the lock screen appears, so once the lock screen dismisses and the real page load begins, the customer briefly sees a blank white WebView while that page loads over the network - easily read as the app being stuck, right after the customer has just proven it's them. A bundled, local loading screen now fills that gap.

Acceptance criteria:
- Shown only for the post-unlock transition, not the plain (non-gated) cold start - that path's WebView load began the moment the Activity was created, before this feature's own `about:blank` reset ever runs, so it has no equivalent gap
- Entirely local: a bundled layout and an indeterminate spinner, no network dependency, no bundled island page needed for this
- Dismissed by a new `FogBackstopWebViewClient.onPageCommitVisible` hook, which fires as soon as whichever page the WebView navigated to is ready to be drawn - earlier than `onPageFinished`'s full-load-event wait - whichever page that turns out to be: the remote origin, or the bundled offline shell if the backstop diverts after a failed remote load
- Colours and card styling mirror `native_biometric_gate.xml` (FR-9.5) so the two read as one continuous transition rather than two different screens

Verified end to end: forced a fresh biometric-enabled state via the device's own `LocalSettingsCache` storage, force-stopped and relaunched, tapped through the native lock screen, and confirmed the loading screen ("Just a moment...") appeared immediately on unlock and was replaced by the real page a moment later, with no re-prompt from the online gate (FR-9.6 correctly recognised the already-shared unlock flag) and no recurrence of the FR-9.6-adjacent hydration-duplication bug fixed 2026-09-18.

Note: customer-facing copy ("Just a moment...") is DRAFT and requires Compliance sign-off before use, as a financial promotion under FOGIL's FCA authorisation.

Files: `template/android/app/src/main/java/com/forestoaksgroup/agua/NativePageLoadingOverlay.java` (new), `MainActivity.java`, `FogBackstopWebViewClient.java`, new `layout/native_page_loading.xml` and a string resource (all fog-mobile-app, Android only)

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

`exp-webapp`, `fog-mobile-app`: lets a signed-in customer see their own policy documents, receive a copy by email, and, once saved on a native device, use one offline. Built in three passes, all on 2026-09-17 or earlier: FR-11.1 to FR-11.4 (`exp-webapp`, web, originally a plain browser download) first; FR-11.5 (`fog-mobile-app`, native/offline) as an explicit follow-up once the web scope was confirmed working; then FR-11.4 was revised (2026-09-17) once browser downloads were judged unsafe for this kind of document - replaced with emailing a copy instead. A same-day addition, password-protecting that email via IronPDF (FR-11.6), was specified, built and then withdrawn before it could be verified against real credentials - see FR-11.6 for that record. FR-11.5's native "Save for offline use" action is deliberately untouched by any of this - see its own note.

### FR-11.1 Policy metadata store

Status: Implemented

Each policy document has a metadata record in a new `policies` MongoDB collection, linked to the customer by `userId`, independent of the document file itself.

Acceptance criteria:
- Stores at minimum a display name and an active/inactive flag, plus optionally a policy/reference number, cover type, start date and end date
- Indexed by `userId` so a customer's own records are looked up directly, never by scanning

Note: there is no admin/back-office authoring flow for these records yet - see [Section 13](#13-known-limitations-and-deferred-work). `scripts/seed-policies.mjs` is a one-off dev helper that upserts records for the two test accounts used to build this feature, not a production ingestion path.

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

### FR-11.4 Document delivery via email (web)

Status: Implemented (supersedes an earlier plain-browser-download version of this requirement, same FR number)

Superseded design, kept for the audit trail: the My Policies screen originally let a customer save a policy document straight to their device via the browser's own download mechanism. Revised 2026-09-17: a direct browser download was judged unsafe for this kind of document, so the web screen now emails a copy to the customer's own registered address instead of serving a direct link. Native's separate "Save for offline use" action (FR-11.5) is unrelated and intentionally unchanged - see that FR's own note. Password protection was specified as part of the same revision (IronPDF, FR-11.6) but was withdrawn the same day, before any credential existed to verify it against - see FR-11.6.

Acceptance criteria:
- A new `POST /api/policies/[id]/email` route: authenticates the caller, confirms the policy belongs to them, and emails the document as an attachment to the signed-in customer's own account email - never a caller-supplied address
- The My Policies screen's action button reads "Email me this document" on web, with sending/sent/error states; no plain download link remains

Note: the underlying file is still read from `public/<userId>/<fileName>` - see the storage-location limitation in [Section 13](#13-known-limitations-and-deferred-work), unchanged by this revision. Sending requires a real Resend account, a verified sending domain and `RESEND_API_KEY`/`EMAIL_FROM` in the environment - none of which exist yet; see Section 13.

Files: `app/api/policies/[id]/email/route.ts`, `lib/email.ts`, `lib/policy-document.ts`, `components/PolicyDeliveryButton.tsx`, `app/policies/page.tsx`

### FR-11.5 Native offline availability

Status: Implemented

A downloaded policy document stays available inside the native app while offline, via a "My policies" entry in the bundled offline shell's Quick Links, matching FR-9's precedent for app-shell islands (emergency, phrase book, ambient noise). Not the full personalised homepage card the original drawn design shows - that still needs ACR-062's device-credential session (recorded in `islands/src/offline.html`'s own header comment) - so this ships as a Quick Links entry rather than a homepage widget.

Acceptance criteria:
- A new `PolicyCache` Capacitor plugin (Android) persists a downloaded file to app-private storage and records its display name, active flag, policy number, cover type and dates alongside it - `cacheFile` never accepts a caller-supplied URL, only a path resolved against this app's own configured origin (mirrors `FogShellPlugin.remoteUrlForPath`'s discipline), since every registered plugin is callable from any frame the WebView loads, including a compromised third-party iframe
- The My Policies web screen offers "Save for offline use" (native) or "Email me this document" (web, FR-11.4) from the same `PolicyDeliveryButton` component, branching on `Capacitor.isNativePlatform()` - a plain `<a download>` is not reliably handled inside a Capacitor WebView, and a browser-style download would not be readable back by the island anyway, since islands share no storage with the signed-in origin
- The islands "My policies" page lists whatever is cached and hands a tap off to the device's own PDF viewer (`ACTION_VIEW` via a `FileProvider` content URI) - it makes no network call of its own and renders identically online or off
- Cached policy files are cleared on sign-out (`PolicyCache.clearCache()`, called from both `components/LogoutButton.tsx` and `components/BiometricGate.tsx`'s own logout path), mirroring FR-9.2's unlock-flag reset, so a different customer signing in next is never handed the previous customer's saved policy documents
- iOS not built - mirrors Section 9's Android-first precedent for native-shell work

Verified: the Android Java compiles clean against the real Capacitor 8.5.0 APIs (`:app:compileDebugJavaWithJavac`) and the island bundle builds clean for all three brands with no unsubstituted placeholders or undefined tokens (`buildIslands()`). The end-to-end runtime flow (save for offline use -> cached file appears in the islands My Policies tab -> opens in the device's PDF viewer) was confirmed working on device against the deployed origin.

Files: `template/android/app/src/main/java/com/forestoaksgroup/agua/PolicyCachePlugin.java` (new), `MainActivity.java`, `res/xml/file_paths.xml` (all `fog-mobile-app`); `islands/src/my-policies.html`/`.css`/`.js` (new), `islands/src/offline.html` (`fog-mobile-app`); `lib/native-permissions.ts`, `components/PolicyDeliveryButton.tsx`, `app/policies/page.tsx`, `components/LogoutButton.tsx`, `components/BiometricGate.tsx` (all `exp-webapp`)

### FR-11.6 Password-protected policy documents (IronPDF) (removed)

Status: Removed same day, before device/credential verification - requirement withdrawn, not abandoned mid-build

Originally: every policy document emailed to a customer (FR-11.4) would be encrypted first, using IronPDF, with a password built from information the customer already knows (first four letters of first name, lower case, plus date of birth as DDMMYYYY - `jaco18051992` for Jacob born 18 May 1992), AES-256, the email body explaining the pattern rather than stating the password. Built, compiling, and confirmed to reach IronPDF's own licence gate against a real seeded PDF - not verified past that point, since no `IRONPDF_LICENSE_KEY` existed. Withdrawn 2026-09-17, the same day it was specified, before any further verification was possible: the `@ironsoftware/ironpdf` dependency, `lib/policy-document.ts`'s encryption path, the password-derivation logic, the licence-gate note above and the two build-configuration fixes it needed (a `pnpm-workspace.yaml` override, `next.config.ts`'s `serverExternalPackages`) were all removed together. `lib/policy-document.ts` now only reads the file, unencrypted, for FR-11.4 to email as-is.

Kept here, not deleted from this document, as the record of what was specified, built and then intentionally taken back out - the same treatment FR-9.3/FR-9.4 got. FR-2.8's first name/date of birth fields were the one piece of this work kept regardless, by product decision, even though no feature currently reads them back - see FR-2.8's own note.

---

## 12. Planned: live connectivity handling and uninstall data hygiene

`fog-mobile-app`: two follow-up requirements agreed on 2026-09-16, after Section 11's native pass was confirmed working. Specified here ahead of implementation, in the same spirit as Sections 9-11 before they were built - status below is honest about it: nothing in this section is built yet.

### FR-12.1 Live online-to-offline transition (native)

Status: Not started - planned for a later session

Today the cold-start gate (Section 9; `FogReachability.isDefinitelyOffline()` inside `MainActivity.runColdStartGate()`) only evaluates connectivity once, at cold start, and the backstop (`FogBackstopWebViewClient`) only diverts to the bundled offline shell when a navigation attempt itself fails. A customer already on the loaded remote origin whose connection drops mid-session - signal lost, flight mode, a tunnel - is not proactively moved to the offline shell; they are left on a now-stale, unresponsive page until they next navigate and that navigation fails.

Requirement as raised: while the customer is online and something in the app loses signal in the meantime, the app should switch back to the offline view.

To work out before this is built, not decided yet:
- A native connectivity listener that runs for the app process's lifetime, not just at cold start (Android: `ConnectivityManager.NetworkCallback`, alongside `FogReachability`'s existing one-shot check) - and whether it should divert straight to `FogShellPlugin.loadLocal("offline.html")`-equivalent native behaviour, or reuse the existing backstop path
- Whether a brief signal drop (a few seconds in a tunnel) should debounce before diverting, to avoid flapping between the remote origin and the offline shell on a flaky connection
- Whether an in-flight navigation or form submission gets to fail on its own terms first, rather than being pre-empted by the listener
- Whether regaining connectivity should auto-return to the remote origin, or continue to require the shell's own "Try again"
- iOS is out of scope for now, mirroring Section 9's Android-first precedent - `FogReachability` already has an iOS counterpart for the cold-start gate; a live listener would need the same treatment there

Files: likely `MainActivity.java`, `FogReachability.java`, `FogShellPlugin.java` (`fog-mobile-app`, Android) - not started

### FR-12.2 Sign-out-before-uninstall ritual and full local data wipe

Status: Not started - planned for a later session

Requirement as raised: prompt a customer to sign out before they uninstall the app, and when that happens, wipe every local record and cache the app holds.

Flag before this is designed, not a reason to drop the requirement: neither Android nor iOS gives an app a hook that runs as it is being uninstalled - by the time the OS could tell an app "you are about to be removed," that app's own process is already gone, so nothing can force a logout or a wipe as a genuine precondition of uninstalling. The literal "ask before uninstall happens" framing is not achievable as stated on either platform; it needs reframing before it is built. Threads worth pulling on next session, not decided yet:
- A visible "Sign out and prepare for removal" action in Settings that a customer is prompted (once, or persistently) to use before uninstalling, that explicitly signs out and clears every native cache this app holds today (`LocalSettingsCache`'s biometric flag and unlock state, FR-9.1/FR-9.2; `PolicyCache`'s saved documents, FR-11.5) - offered and prompted, not enforced, since it cannot be enforced
- On Android, app-private storage (`SharedPreferences`, internal `filesDir`, which is where both `LocalSettingsCache` and `PolicyCache` write today) is already wiped by the OS on a genuine uninstall as standard platform behaviour - the "wipe cache data" half of this ask may already be satisfied for a real uninstall as-is, which would narrow the real open problem to the sign-out prompt and the reinstall-or-handed-to-someone-else case, not a wipe the app needs to build itself
- Needs a scope decision next session: is this about a genuine OS uninstall (where the platform likely already clears app-private storage), or about a customer switching accounts or handing the device on without uninstalling (a case FR-11.5's existing sign-out-clears-`PolicyCache` behaviour, and the equivalent for `LocalSettingsCache`, already cover)? The requirement as raised reads like the former; the behaviour that is actually buildable and already partly exists is the latter
- Whichever direction this takes, treat a cache as untrusted at next launch rather than as a guarantee sign-out happened first - the same discipline `LocalSettingsCache`'s biometric flag already follows (corrected at every online sync, never the source of truth)

Files: not yet determined

---

## 13. Known limitations and deferred work

Raised and consciously set aside during this build phase, not overlooked.

- **Quiet hours delivery is suppress-only, not queued.** A withheld push is not re-attempted after the window ends. A fuller design adding a durable delayed-delivery queue and a per-brand drain job was scoped but not built, in favour of the simpler behaviour for this iteration.
- **The quiet-hours bypass list ships empty.** The mechanism to exempt a notification category from quiet hours exists, but no category is on it yet, and there is no customer-facing control to manage it. It is a fixed backend policy today.
- **Settings still depend on a server round-trip to open.** The on-device cache (FR-3.1) removes the visible flash while a page's own checks resolve; it does not remove the Settings page's own server-rendered data fetch. Doing so was considered and deliberately deferred as a larger, riskier restructuring.
- **FR-3.1 and FR-3.4 remain unverified on real hardware.** Both were checked by type-checking, lint and server-rendering only; neither has been exercised on an actual Android device with real biometric hardware. Unlike Section 9's Android work, no emulator/device pass has been done for these two specifically.
- **Section 9's Android build has an emulator pass, not a physical-device or iOS pass.** FR-9.1, FR-9.2, FR-9.5 and FR-9.6 were verified end to end on an Android emulator (Pixel_7a AVD) against a live deployed environment, before FR-9.1/FR-2.7's 2026-09-17 revision to a device-only preference: registration, enabling biometrics, a full process restart correctly re-triggering the native gate, and the online gate correctly recognising an already-unlocked device with no second prompt. Not yet checked: a physical Android device, the `DEVICE_CREDENTIAL` (PIN/pattern) fallback path specifically (only the fingerprint path was exercised), the logout-clears-native-flag path, and anything on iOS (FR-9.5 is Android-only by design - see `fog-mobile-app`'s README "Known gaps").
- **FR-2.7/FR-9.1's device-only revision (2026-09-17) has not itself been verified on device.** The new direct-write call sites (`components/SettingsToggles.tsx`'s enable/disable handlers, `app/register/page.tsx`'s post-registration prompt) and `components/BiometricGate.tsx`'s restructured async check have only been type-checked, linted and built - not exercised against real biometric hardware since the change. The underlying `LocalSettingsCache` plugin mechanism is untouched and was itself verified before the revision (see the bullet above), which lowers but does not remove this risk.
- **Removing the account-level `biometricEnabled` copy removes its self-correction property.** Recorded in FR-9.1 and in `fog-mobile-app`'s README: previously a wrongly-flipped on-device value (for example, from a compromised third-party iframe, since every registered plugin is callable from any frame - see that README's caller-set discussion) would self-correct at the next online sync against Mongo. Now the device's own copy is the only copy, so a caller that silently disables it leaves it disabled until the customer notices and re-enables it from Settings. It cannot, either way, grant an unlock without the separate hardware `authenticate()` step still succeeding - accepted on that basis, not blocking.
- **FR-10.1's native session renewal is verified against a local dev server and this repo's own local MongoDB, not the deployed environment.** The renewal logic was exercised directly over HTTP with a simulated native header/cookie against `pnpm dev` and the database configured in `.env.local`; it has not yet been triggered by a real native app cold-launch/page-load request, nor checked against whatever database the deployed environment actually uses.
- **FR-2.5's 2026-09-18 focus/visibility permission re-sync fix has not been verified on device.** Checked by type-checking and lint only. It relies on the native Android WebView firing `visibilitychange` on the host Activity's own pause/resume the same way a browser tab does; if that assumption turns out wrong on a real device, the `window focus` listener added alongside it is the only remaining signal, and neither has been exercised against real OS permission revocation on an emulator or physical device yet.
- **FR-2.9's per-device notifications toggle has not been verified on device, and defaulting it to off silently stops every existing device's pushes until it revisits Settings.** Checked by type-checking and lint only - not exercised against real permission grant/revoke on an emulator or device, against a real web-push token, or against fog-push-notification-service's actual per-device dispatch filtering end to end. Separately: since `devices.notificationsEnabled` is a brand-new field with no backfill from existing OS/browser permission state (by product decision - see FR-2.9's note), every device registered before this shipped reads as off until Settings is opened again on that same device, even if it already had working notifications. Low-risk today given FOG is pre-launch with only dummy test accounts/devices and every push job disabled by default (FR-1.1), but worth remembering before any real device exists. The now-deleted `scripts/migrate-user-preferences.mjs` addressed the separate `preferences` restructuring for the dev database's existing test accounts (run and verified 2026-09-18), but there is no equivalent backfill for this field - by design, matching the "default off" decision.
- **A Chrome-specific notification permission report was diagnosed, not root-caused.** Firefox worked, Chrome did not respond to a permission request in one production report. This was traced to browser or profile-level permission state (an already-blocked origin, or Chrome's quiet-permission UI) rather than a defect in this codebase, and a clearer in-app error message was added regardless.
- **Policy documents are served from Next.js's `public/` static directory, with no per-request authentication check on the file itself.** A policy PDF is technically fetchable by anyone who has, or guesses, its URL, regardless of who is signed in. This was a deliberate choice for the current testing phase against two dummy test accounts, not an oversight, and needs to be revisited (moving files to a private, server-only directory served through an authenticated route) before any real customer document is stored this way.
- **FR-11.5's native offline availability has an emulator pass, not a physical-device or iOS pass.** Confirmed working on an Android emulator (Pixel_7a AVD) against the deployed origin: saving a policy document for offline use, the islands "My policies" tab listing it, and opening it in the device's PDF viewer. Not yet checked: a physical Android device, a large policy PDF against the plugin's 25MB cache cap, and anything on iOS (no `PolicyCache` counterpart exists there yet, mirroring FR-9.5's Android-first precedent).
- **Policy metadata has no admin/back-office authoring flow.** Records are written directly into MongoDB today, via `scripts/seed-policies.mjs` for the two test accounts built against. That is a dev convenience, not viable once there is a genuine operational process for adding a customer's policy documents.
- **A live connectivity-loss transition and an uninstall data-hygiene ritual are agreed requirements, not yet built.** See [Section 12](#12-planned-live-connectivity-handling-and-uninstall-data-hygiene) (FR-12.1, FR-12.2) for what is understood so far, including why the uninstall requirement as raised needs reframing before it can be built at all - neither Android nor iOS lets an app hook its own uninstall.
- **FR-11.4's email delivery has no real credentials configured anywhere yet.** `RESEND_API_KEY` and `EMAIL_FROM` are both absent from every environment, so the actual send call has never been exercised - only compiled and built. Needs a real Resend account with a verified sending domain before this can be verified further.
