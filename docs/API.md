# exp-webapp REST API reference

Doc ID: FOG-API-EXP-01
Status: Draft, unreviewed
Audience: backend engineers scoping the extraction of this API surface into a dedicated service
Source: read directly from the `exp-webapp` codebase on 2026-09-23. Every claim below is a description of what the code currently does, not a specification of what it should do.

This document is a reference, not a design for the new service. It records every REST endpoint that exists today under `app/api/`, the conventions they share, the endpoints that are missing (because the equivalent read happens inside a Server Component instead), and the issues a migration needs to resolve. Treat every "Implemented" claim here the same way SRS.md asks you to treat its own: verify against the current code before relying on it for a production decision.

None of this has run against live customers or production traffic. FOGIL (company 17037311) is pre-launch.

## Contents

1. [Scope](#1-scope)
2. [Cross-cutting concerns](#2-cross-cutting-concerns)
3. [Endpoint reference](#3-endpoint-reference)
4. [Read paths with no REST endpoint today](#4-read-paths-with-no-rest-endpoint-today)
5. [Data model](#5-data-model)
6. [Known issues and blockers for extraction](#6-known-issues-and-blockers-for-extraction)
7. [Considerations for the new service](#7-considerations-for-the-new-service)

---

## 1. Scope

This covers every file matching `app/api/**/route.ts` in `exp-webapp`. Fourteen route files, sixteen handlers:

| Domain | Routes |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` |
| Account | `PATCH /api/account/profile` |
| Journeys | `GET /api/journeys`, `POST /api/journeys`, `DELETE /api/journeys/{id}` |
| In-app notifications | `GET /api/notifications`, `DELETE /api/notifications`, `DELETE /api/notifications/{id}` |
| Notification preferences and devices | `POST /api/notifications/device-token`, `POST /api/notifications/enabled`, `POST /api/notifications/quiet-hours`, `POST /api/notifications/timezone`, `POST /api/notifications/topics` |
| Policy documents | `POST /api/policies/{id}/email` |

Not covered: `fog-push-notification-service` (a separate repo and a separate service already) and the Server Component read paths described in [Section 4](#4-read-paths-with-no-rest-endpoint-today), which are not REST endpoints at all today.

## 2. Cross-cutting concerns

### 2.1 No versioning, no base path

Every route is mounted directly under `/api/`. There is no `/v1` prefix and no API version header. A dedicated service should decide this deliberately rather than inherit the absence of one.

### 2.2 Authentication: an opaque session cookie, checked against MongoDB on every request

There is no bearer token and no API key. Every authenticated handler calls `getCurrentUser()` (`lib/auth/session.ts`), which:

1. Reads the `fog_session` cookie (httpOnly, `sameSite: lax`, `secure` in production).
2. Hashes it (SHA-256) and looks up a `sessions` document by that hash.
3. Rejects if the session is missing or `expiresAt` has passed.
4. Loads the `users` document for `session.userId`.

`createSession()` sets the cookie with a 90-day TTL for a native client, 7 days otherwise (see 2.3). There is no refresh token and no logout-everywhere endpoint; `POST /api/auth/logout` deletes only the one session document matching the caller's own cookie.

A handler with no valid session returns `401 { "error": "Not signed in." }`. This is a session lookup against MongoDB on every request, not a stateless token verification. A dedicated service either needs its own path to the same `sessions`/`users` collections, or the session model needs to change (see Section 6).

### 2.3 Native app detection and session renewal happen outside the route handlers

`proxy.ts` (this repo's request-level interceptor, run by the Next.js host before a page or route is served) does two things relevant to the API surface, for requests carrying either the `X-FOG-Native-Client` header (sent once, on the native app's cold-launch page load) or the `fog_native_client` cookie it sets from that header:

- Persists the native flag as a long-lived cookie (400 days), since the header itself is only ever sent once.
- Calls `renewNativeSessionIfStale()` (`lib/auth/session.ts`), which slides a native session's `expiresAt` forward to a fresh 90 days once less than a day of its life remains, throttled to once per session per calendar day.

`proxy.ts`'s own matcher explicitly excludes `/api/*` ("the native header never reaches API routes anyway"), so **this renewal currently only fires on page navigations, not on API calls**. A dedicated API service that the native app talks to directly, without also loading pages through this Next.js host, would never trigger this renewal path at all, and a native session would start hard-expiring after 90 days again unless this logic is ported or reachable another way. Flag this for whoever owns the migration; it is not addressed in this document.

### 2.4 Brand scoping is a deployment, not a request parameter

There is no `brandId` field on any request or response body. `BRAND_ID` (`lib/brand.ts`) is a build-time/deployment-time environment variable; each brand (Agua, Bounce, Centrd) is its own deployment against its own MongoDB database, so every document in a given deployment's database already belongs to one brand by construction. A dedicated service needs to either preserve this one-deployment-per-brand model or make brand an explicit, validated request dimension if it becomes a single multi-tenant service. That decision is not made anywhere in the current code and needs a deliberate call, not an inherited default.

### 2.5 Response and error conventions

- Every success response is `200` with a small JSON object, usually `{ "ok": true }`, sometimes carrying the created/fetched resource (`{ "journey": ... }`, `{ "journeys": [...] }`, `{ "notifications": [...] }`).
- Every error response is `{ "error": "<human-readable sentence>" }`. There is no machine-readable error code field anywhere. A caller has to match on the English string if it needs to branch, which it currently never does.
- Status codes actually used across the surface: `200`, `400` (validation), `401` (not signed in), `404` (not found / not owned), `409` (duplicate email), `502` (upstream send failure, policy email only). Nothing returns `403`; ownership failures are reported as `404`, not `403`, so as not to confirm a resource ID belongs to someone else.
- Every handler parses the body with `request.json().catch(() => null)`, so a malformed body degrades to a `400` from the field-level check rather than an unhandled parse exception.

### 2.6 CORS: none, because none is needed today

No route sets CORS headers. This works today because both the browser app and the native app's WebView (`fog-mobile-app`'s `capacitor.config.json` `server.url` points at the deployed `exp-webapp` origin directly) load this same origin, so every API call is same-origin. **Moving the API to a separate host breaks this assumption** and needs either CORS configuration, a same-parent-domain cookie strategy, or a backend-for-frontend proxy kept on this origin. See Section 6.

### 2.7 Environment variables the current handlers depend on

| Variable | Used by | Notes |
|---|---|---|
| `MONGODB_URI` | every handler, via `lib/db.ts` | throws on startup if unset |
| `MONGODB_DB_NAME` | `lib/db.ts` | defaults to `exp_webapp` |
| `BRAND_ID` | `lib/notification-topics-admin.ts` | server-only, no `NEXT_PUBLIC_` prefix; empty string skips topic reconciliation with a console warning rather than failing the request |
| `FIREBASE_SERVICE_ACCOUNT_BASE64` | `lib/firebase-admin.ts`, used by the topics/device-token routes | base64-encoded service account JSON; throws if unset |
| `RESEND_API_KEY` | `lib/email.ts`, used by the policy email route | throws if unset; **not configured in any environment today**, see Section 6 |
| `EMAIL_FROM` | `lib/email.ts` | throws if unset |
| `NODE_ENV` | session cookie `secure` flag | standard Next.js |

`NEXT_PUBLIC_FIREBASE_*` variables also exist but are client-side (web push registration in the browser), not consumed by any route handler.

---

## 3. Endpoint reference

Unless stated otherwise, request and response bodies are JSON, and every field listed under "Request" is required.

### 3.1 Auth

#### `POST /api/auth/register`

Creates an account and signs the caller in.

Request:
```json
{ "email": "string", "password": "string (min 8 chars)", "firstName": "string", "dateOfBirth": "YYYY-MM-DD" }
```

Response `200`: `{ "ok": true }`, plus a `Set-Cookie: fog_session=...` (httpOnly).

Errors:
- `400`: invalid email format, password under 8 characters, empty first name, or `dateOfBirth` not in `YYYY-MM-DD` / not a parseable date
- `409`: an account with that email already exists (checked case-insensitively via a MongoDB collation, and again as a fallback on the unique-index duplicate-key error)

Side effects: inserts a `users` document with `preferences.subscribedTopics` seeded from the `notification_topics` catalog's `defaultSubscribed` entries; creates a session (see 2.2/2.3 for TTL).

File: `app/api/auth/register/route.ts`

#### `POST /api/auth/login`

Request:
```json
{ "email": "string", "password": "string" }
```

Response `200`: `{ "ok": true }`, sets the session cookie.

Errors:
- `401`: `{ "error": "Incorrect email or password." }` for either a missing account or a wrong password. Deliberately the same message for both cases; do not split this into separate messages in a rewrite, since that would let a caller enumerate registered emails.

File: `app/api/auth/login/route.ts`

#### `POST /api/auth/logout`

No request body. Deletes the caller's own session document (matched by the cookie's hash) and clears the cookie.

Response `200`: `{ "ok": true }` unconditionally, including when the caller was already signed out (there is no `getCurrentUser()`/401 check on this route, unlike every other authenticated route).

File: `app/api/auth/logout/route.ts`

### 3.2 Account

#### `PATCH /api/account/profile`

Auth required.

Request:
```json
{ "firstName": "string", "dateOfBirth": "YYYY-MM-DD" }
```

Response `200`: `{ "ok": true }`.

Errors: `401` not signed in; `400` empty first name or unparseable/malformed `dateOfBirth`.

Note: this is a full replace of both fields, not a partial patch despite the HTTP method name; there is no way to update one without resending the other. `firstName`/`dateOfBirth` are collected at registration for a feature (password-derived PDF encryption) that was specified, built and withdrawn the same day (SRS FR-11.6); nothing currently reads these fields back after they are written.

File: `app/api/account/profile/route.ts`

### 3.3 Journeys

#### `GET /api/journeys`

Auth required. Returns every journey belonging to the caller, ascending by `journeyDate`.

Response `200`: `{ "journeys": JourneyDoc[] }` (see Section 5 for the shape).

#### `POST /api/journeys`

Auth required.

Request:
```json
{ "date": "YYYY-MM-DD", "time": "HH:MM" }
```

Response `200`: `{ "journey": JourneyDoc }`.

Errors: `401`; `400` for a malformed date or time, or a combination that fails to parse.

Note: `date`/`time` are composed directly into `` `${date}T${time}:00.000Z` `` and stored as UTC. There is no per-request time zone parameter; the customer's own IANA time zone (`UserDoc.timeZone`, set separately via `POST /api/notifications/timezone`) is not consulted here, only by `fog-push-notification-service`'s reminder job when it later evaluates quiet hours. A journey's stored `journeyDate` is only as correct as the caller's assumption that `date`+`time` should be read as UTC; confirm this is the intended contract before this endpoint moves.

Files: `app/api/journeys/route.ts` (`GET`, `POST`)

#### `DELETE /api/journeys/{id}`

Auth required. Deletes a journey by ID, scoped to the caller (`{ _id: id, userId: user._id }`, so one account can never delete another's journey by guessing an ID).

Response `200`: `{ "ok": true }`.

Errors: `401`; `404` if no matching, owned journey exists.

File: `app/api/journeys/[id]/route.ts`

### 3.4 In-app notifications (the dashboard bell)

#### `GET /api/notifications`

Auth required. Returns every notification recorded for the caller, descending by `createdAt`.

Response `200`: `{ "notifications": NotificationDoc[] }`.

#### `DELETE /api/notifications`

Auth required. Deletes every notification belonging to the caller ("Clear all").

Response `200`: `{ "ok": true }`.

Files: `app/api/notifications/route.ts` (`GET`, `DELETE`)

#### `DELETE /api/notifications/{id}`

Auth required. Deletes one notification, scoped to the caller.

Response `200`: `{ "ok": true }`. Errors: `401`; `404` if not found/owned.

File: `app/api/notifications/[id]/route.ts`

These records are written by `fog-push-notification-service`, not by `exp-webapp` itself; `exp-webapp` only reads and deletes them. A dedicated service taking over this surface needs to keep whatever contract the push service currently writes against (the `notifications` collection shape in Section 5), or the push service needs a corresponding change.

### 3.5 Notification preferences and device registration

All five routes below require auth and return `401 { "error": "Not signed in." }` otherwise. None have a `GET` counterpart; see Section 4.

#### `POST /api/notifications/device-token`

Registers or re-registers this device's push token (an upsert keyed by the token itself).

Request:
```json
{ "token": "string (non-empty)", "platform": "native | web" }
```

Response `200`: `{ "ok": true, "notificationsEnabled": boolean }`, the device's own current `notificationsEnabled` value (see `DeviceDoc` in Section 5), so the caller learns it in the same round trip rather than needing a second request.

Errors: `400` for a missing/empty token or an invalid platform value.

Side effect: if this token was not previously registered and `platform` is `"web"`, subscribes it (via the Firebase Admin SDK) to the FCM topic for every topic id currently in the account's `preferences.subscribedTopics`. Native devices subscribe themselves client-side and are not touched by this.

File: `app/api/notifications/device-token/route.ts`

#### `POST /api/notifications/enabled`

Sets this specific device's own notifications master toggle. This is a per-device value (`DeviceDoc.notificationsEnabled`), not an account-wide one; see `SRS.md` FR-2.9 for why.

Request:
```json
{ "token": "string (non-empty)", "enabled": boolean }
```

Response `200`: `{ "ok": true }`.

Errors: `400` invalid body; `404`: `{ "error": "Device not registered for this account." }` if `token` doesn't match a device row owned by the caller. The match is `{ _id: token, userId: user._id }`, so one account can never flip a device registered to a different account, even by supplying a token it doesn't own.

Note: calling `POST /api/notifications/device-token` first is a precondition, not enforced by this route directly; it relies on the device row already existing.

File: `app/api/notifications/enabled/route.ts`

#### `POST /api/notifications/quiet-hours`

Sets the account-wide (not per-device) quiet-hours window.

Request:
```json
{ "enabled": boolean, "startTime": "HH:MM", "endTime": "HH:MM" }
```

Response `200`: `{ "ok": true }`. Errors: `400` on a missing/malformed field.

Note: this is a full replace of `UserDoc.preferences.quietHours` (`$set`), not a partial update. `startTime`/`endTime` are stored as local wall-clock strings; the time zone they're evaluated against is a separate field (`UserDoc.timeZone`, next endpoint), read independently by `fog-push-notification-service` at send time.

File: `app/api/notifications/quiet-hours/route.ts`

#### `POST /api/notifications/timezone`

Sets the account's detected IANA time zone.

Request:
```json
{ "timeZone": "string (valid IANA identifier)" }
```

Validated via `Intl.DateTimeFormat(undefined, { timeZone })` not throwing. Response `200`: `{ "ok": true }`. Errors: `400` if invalid.

File: `app/api/notifications/timezone/route.ts`

#### `GET /api/notifications/topics`

Returns this brand's notification topic catalog, sorted by `sortOrder`.

Response `200`: `{ "topics": NotificationTopicCatalogEntry[] }` (see Section 5 for the shape).

File: `app/api/notifications/topics/route.ts`

#### `POST /api/notifications/topics`

Sets one notification topic's opt-in state.

Request:
```json
{ "topicId": "string (must match an id in the notification_topics catalog)", "enabled": boolean }
```

Response `200`: `{ "ok": true }`. Errors: `400` unknown `topicId` or non-boolean `enabled`.

Side effect: adds/removes `topicId` from `preferences.subscribedTopics` (`$addToSet`/`$pull`), then subscribes/unsubscribes every `platform: "web"` device on this account to/from the brand-scoped FCM topic for that id (Admin SDK). Native devices manage their own subscription client-side (only for topics the native app recognises) and are not touched by this route.

File: `app/api/notifications/topics/route.ts`

### 3.6 Policy documents

#### `POST /api/policies/{id}/email`

Auth required. Emails a copy of one of the caller's own policy documents.

No request body. `{id}` is the `PolicyDoc._id`.

Response `200`: `{ "ok": true }`.

Errors:
- `401` not signed in
- `404`: `{ "error": "Policy not found." }` if no policy with that ID belongs to the caller
- `502`: `{ "error": "Couldn't send that document. Try again." }` if reading the file or sending via Resend throws

**This endpoint has an open, uninvestigated correctness issue: it currently sends to a hardcoded address, not the caller's own email.** See Section 6.1; do not treat this route as ready to carry forward as-is.

File: `app/api/policies/[id]/email/route.ts`

---

## 4. Read paths with no REST endpoint today

This is the part of the surface most relevant to "ship this on a dedicated service": several reads that a new service would need to expose as endpoints are not REST endpoints in `exp-webapp` today. They are plain Next.js Server Components calling `getCurrentUser()`/`getDb()` directly and rendering HTML server-side. There is nothing to point a new frontend or a native HTTP client at for these today:

| Data needed | Currently read by | Would need |
|---|---|---|
| Signed-in user's own profile (email, first name, date of birth, `createdAt`) | `app/account/page.tsx`, `app/dashboard/page.tsx` | e.g. `GET /api/account/profile` |
| This account's notification topic preferences and quiet-hours settings | `app/settings/page.tsx` | e.g. `GET /api/notifications/preferences` |
| This account's policy documents | `app/policies/page.tsx` (a direct `db.collection("policies").find({ userId })` query) | e.g. `GET /api/policies` |

None of these three exist as `route.ts` files. Building them is a prerequisite for a dedicated service to be useful to any client that isn't itself a Next.js Server Component in this same process, including a rewritten `exp-webapp` frontend calling out to the new service, or `fog-mobile-app` calling it directly instead of going through page loads.

Two per-device values are also only ever learned as a side effect of a write, never a dedicated read: `DeviceDoc.notificationsEnabled` comes back only from the `POST /api/notifications/device-token` response, and there is no endpoint to look up an arbitrary device's current state without re-registering it.

---

## 5. Data model

Collections referenced by the routes above (from `lib/db.ts`). One database per brand deployment (Section 2.4); no document carries a brand field.

```ts
interface UserDoc {
  _id: string;                    // randomUUID
  email: string;                  // unique index, case-insensitive collation
  passwordHash: string;
  passwordSalt: string;
  firstName?: string;             // optional only because pre-existing accounts predate it
  dateOfBirth?: Date;              // UTC midnight
  preferences: {
    subscribedTopics: string[];     // ids from the notification_topics catalog, below
    quietHours?: { enabled: boolean; startTime: string; endTime: string }; // "HH:mm" local wall-clock
  };
  timeZone?: string;               // IANA identifier
  createdAt: Date;
  lastLoginAt?: Date;
}

interface NotificationTopicDoc {
  _id: string;                    // slug, e.g. "essentials" - also the subscribedTopics array element
  displayName: string;             // Settings toggle label - DRAFT, Compliance sign-off required
  description: string;             // Settings toggle caption - DRAFT, Compliance sign-off required
  sortOrder: number;
  defaultSubscribed: boolean;      // seeded into subscribedTopics at registration
  nativeAndroidTopic: boolean;     // true only for ids the native Android plugin's whitelist recognises
  cron: string;                    // consumed by fog-push-notification-service's scheduler
  enabled: boolean;                // gates whether the broadcast job is scheduled
  createdAt: Date;
  updatedAt: Date;
}

interface SessionDoc {
  _id: string;                    // sha256(token) - the raw token only ever exists in the cookie
  userId: string;
  expiresAt: Date;                // TTL-indexed; MongoDB reaps expired sessions itself
  createdAt: Date;
}

interface DeviceDoc {
  _id: string;                    // the FCM/web-push token itself
  userId: string;
  platform: "native" | "web";
  createdAt: Date;
  updatedAt: Date;
  notificationsEnabled?: boolean; // per-device master toggle; optional, defaults to off
}

interface JourneyDoc {
  _id: string;
  userId: string;
  journeyDate: Date;
  createdAt: Date;
  reminderSentAt: Date | null;    // set by fog-push-notification-service, not by this API
}

interface NotificationDoc {
  _id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: Date;                // written by fog-push-notification-service, not by this API
}

interface PolicyDoc {
  _id: string;
  userId: string;
  displayName: string;
  active: boolean;
  policyNumber?: string;
  coverType?: string;
  startDate?: Date;
  endDate?: Date;
  fileName: string;               // resolved against public/<userId>/<fileName> - see 6.2
  createdAt: Date;
}
```

Indexes currently created: `users.email` (unique, collated), `sessions.expiresAt` (TTL), `journeys.{userId, journeyDate}` and `journeys.{journeyDate, reminderSentAt}`, `notifications.{userId, createdAt}`, `devices.userId`, `policies.userId`.

`PolicyDoc` records have no authoring flow; they are written directly to MongoDB by a one-off dev script (`scripts/seed-policies.mjs`) against two test accounts. There is no `POST`/`PUT` endpoint for creating or updating a policy record anywhere in this API.

---

## 6. Known issues and blockers for extraction

Ranked by what would actually cause harm if carried into a new service unexamined.

### 6.1 Critical: the policy-email endpoint sends to a hardcoded address, not the customer's own email

`app/api/policies/[id]/email/route.ts` line 33 currently has:

```ts
to: "ashutosh.18k92@gmail.com",//user.email,
```

with a `//TODO: configure the domain to send emails` comment above it. Every call to this endpoint, for any signed-in customer, currently sends that customer's policy document to one hardcoded personal address, not to `user.email` as the code right next to it (commented out) and FR-11.4's own acceptance criteria both say it should. This has not sent anything for real yet only because `RESEND_API_KEY` is unset in every environment (Section 2.7 and SRS.md Section 13), so the send call throws before reaching Resend. That is incidental, not a safeguard.

This is a data-handling defect, not a style issue: a policy document is the kind of correspondence that should only ever reach the customer it belongs to. Flag this to whoever owns `exp-webapp` before any Resend credentials are configured in any environment, and fix the line (restore `user.email`, remove the hardcoded address and the stale TODO) as part of, or before, any migration of this endpoint. Do not carry this line forward into a new service as-is.

### 6.2 Policy PDFs are served from an unauthenticated static path

`lib/policy-document.ts` reads from `public/<userId>/<fileName>` (Next.js's static asset root), which Next.js serves to anyone who requests that exact URL, signed in or not. This is already recorded as a known limitation in `SRS.md` Section 13, accepted for the current two-dummy-account testing phase, not a decision to carry into a real deployment. A dedicated service should not inherit "serve customer documents from a public static directory" as its storage model; this needs an authenticated, per-request-checked file store (private bucket plus a signed/short-lived URL, or a proxying route that re-checks ownership on every fetch) before this endpoint is rebuilt elsewhere.

### 6.3 No credentials configured for email delivery anywhere

`RESEND_API_KEY` and `EMAIL_FROM` are absent from every environment today (Section 2.7). The email-delivery path is compiled and type-checked, not verified end to end. Needs a real Resend account and a verified sending domain, independent of 6.1, before this endpoint can be trusted in any environment.

### 6.4 Session validation is a MongoDB lookup, not a portable token

Section 2.2: there is no JWT, no signed/stateless token, nothing a new service can verify without either sharing the same `sessions`/`users` collections or exposing an internal "validate this session" call back to `exp-webapp`. Decide this deliberately; do not let the new service end up with two independent, potentially divergent, session stores.

### 6.5 Native session renewal is wired into page navigation, not API calls

Section 2.3: `proxy.ts` explicitly skips `/api/*`. If the native app starts calling a separate API host directly instead of routing through `exp-webapp` page loads, the sliding 90-day renewal stops firing for API-only traffic. This needs an explicit decision (renew on every native API call instead, keep native traffic routed through this host, or something else), not a silent behaviour change.

### 6.6 No CORS; cookie-based auth assumes same-origin

Section 2.6. A separate API origin breaks both same-origin `fetch` calls from the browser build and the implicit cookie attachment session auth depends on, unless the new host shares a parent domain with `SameSite=Lax` cookies, or a proxy/BFF is kept in front of it, or auth changes to something cross-origin-friendly (e.g. a bearer token). This is the single biggest architectural fork in the road for this migration and is not resolved anywhere in the current code.

### 6.7 Brand and database topology

Section 2.4. Three brands, three deployments, three databases, one shared codebase. A single dedicated service replacing all three needs an explicit multi-tenancy story (request-scoped brand context plus per-brand connection routing, or three separate service deployments mirroring today's model). Neither is implemented; `BRAND_ID` today is read once at process start, not per request.

### 6.8 No rate limiting or abuse controls on any route

None of `/api/auth/login`, `/api/auth/register`, or the policy email endpoint have any throttling. This is a pre-launch codebase with no live traffic yet, so it hasn't mattered; it will matter once real customers exist, and is worth deciding before extraction rather than after.

---

## 7. Considerations for the new service

Not a migration plan, just the questions Section 6 raises that whoever scopes the actual work will need answers to before starting:

- **Auth model**: keep the shared-Mongo-session model (simplest, keeps this document's contract unchanged) versus move to a portable token the new service can verify independently.
- **Topology**: one service shared across all three brands with per-request tenancy, versus three deployments mirroring the current one-deployment-per-brand model.
- **Missing reads**: the three SSR-only read paths in Section 4 need to become real endpoints regardless of which way the two questions above land.
- **File storage**: policy documents need to leave `public/` before this is anywhere but a dev/test environment (6.2).
- **Fix-before-carry-forward**: 6.1's hardcoded email address should not reach a new service's codebase at all, let alone a production one.

This document does not recommend an approach on the first two; they are genuine architectural decisions for whoever owns this work, not something to infer from the current code's accidents of implementation.
