import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import type { NotificationTopicCatalogEntry } from "@/lib/notification-topics-catalog";

const DB_NAME = process.env.MONGODB_DB_NAME || "exp_webapp";
const EMAIL_COLLATION = { locale: "en", strength: 2 } as const;

const globalForDb = globalThis as unknown as {
  fogMongoClientPromise?: Promise<MongoClient>;
  fogMongoIndexesReady?: Promise<void>;
};

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set - add it to .env.local for local dev, or the deployment's environment variables.",
    );
  }
  const client = new MongoClient(uri, {
    serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
  });
  return client.connect();
}

function getClientPromise(): Promise<MongoClient> {
  if (!globalForDb.fogMongoClientPromise) {
    globalForDb.fogMongoClientPromise = connect();
  }
  return globalForDb.fogMongoClientPromise;
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db
      .collection("users")
      .createIndex({ email: 1 }, { unique: true, collation: EMAIL_COLLATION }),
    db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("journeys").createIndex({ userId: 1, journeyDate: 1 }),
    db.collection("journeys").createIndex({ journeyDate: 1, reminderSentAt: 1 }),
    db.collection("notifications").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("devices").createIndex({ userId: 1 }),
    db.collection("policies").createIndex({ userId: 1 }),
    // Multikey index (Mongo builds this automatically for an array field) -
    // serves the array-membership filter fog-push-notification-service runs
    // per catalog topic (subscribedTopics: topicId).
    db.collection("user_preferences").createIndex({ subscribedTopics: 1 }),
  ]);
}

export async function getDb(): Promise<Db> {
  const client = await getClientPromise();
  const db = client.db(DB_NAME);
  if (!globalForDb.fogMongoIndexesReady) {
    globalForDb.fogMongoIndexesReady = ensureIndexes(db);
  }
  await globalForDb.fogMongoIndexesReady;
  return db;
}

export function emailCollation() {
  return { collation: EMAIL_COLLATION };
}

/**
 * Shared helper so "the brand's catalog, sorted for display" is one Mongo
 * call reused by every caller (the topics route, the settings/dashboard
 * pages, registration) instead of four independently hand-written
 * .find({}).sort({sortOrder:1}) calls that can drift.
 */
export async function getNotificationTopicsCatalog(db: Db): Promise<NotificationTopicDoc[]> {
  return db.collection<NotificationTopicDoc>("notification_topics").find({}).sort({ sortOrder: 1 }).toArray();
}

/**
 * Shared helper so "this account's settings" is one Mongo call reused by
 * every caller (the topics/quiet-hours/device-token routes, the
 * settings/dashboard pages) instead of each one hand-rolling its own query
 * against the user_preferences collection.
 */
export async function getUserPreferences(db: Db, userId: string): Promise<UserPreferencesDoc | null> {
  return db.collection<UserPreferencesDoc>("user_preferences").findOne({ _id: userId });
}

export interface NotificationTopicDoc extends NotificationTopicCatalogEntry {
  cron: string; // consumed by fog-push-notification-service's scheduler
  enabled: boolean; // gates whether the broadcast job is scheduled (replaces ENABLE_<BRAND>_<CATEGORY>_BROADCAST_JOB)
  createdAt: Date;
  updatedAt: Date;
}

export interface QuietHoursSettings {
  enabled: boolean;
  startTime: string; // "HH:mm", local wall-clock
  endTime: string; // "HH:mm"; numerically before startTime means an
  // overnight window (e.g. 22:00 -> 07:00)
}

// Account-wide preferences - the same across every device a customer uses,
// unlike DeviceDoc.notificationsEnabled below, which each registered device
// tracks separately. Its own collection, keyed by the owning user's _id
// (same "_id as the natural key" convention as DeviceDoc._id being the push
// token), rather than nested on UserDoc - this is where any future setting
// belongs too, instead of a new inline query per call site.
export interface UserPreferencesDoc {
  _id: string;
  subscribedTopics: string[];
  quietHours?: QuietHoursSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  // Required at registration; optional here only because accounts created
  // before this field existed predate it - see app/account/page.tsx for how
  // an existing account fills these in. No feature currently reads these
  // back (see SRS.md FR-2.8) - kept after the one feature that used to need
  // them, PDF password protection, was withdrawn.
  firstName?: string;
  dateOfBirth?: Date;
  // Deliberately NOT stored here - biometric sign-in is a per-device
  // convenience setting, not an account-wide policy, so it lives only in
  // the native on-device store (LocalSettingsCache, lib/native-permissions.ts)
  // that already exists for the offline islands (SRS FR-2.7/FR-9.1). A
  // second device signing into the same account starts with it off. The
  // Settings screen's "Notifications" master toggle is the same story -
  // moved to DeviceDoc.notificationsEnabled (2026-09-18) once it became
  // clear it needed to be a per-device setting, not an account-wide one: a
  // customer can have this on for their phone and off for their browser.
  // Account-wide settings (subscribedTopics, quietHours) live in their own
  // user_preferences collection (UserPreferencesDoc, same file) instead of
  // nested here - see getUserPreferences.
  // IANA identifier, e.g. "Europe/London" - kept current by a client-side
  // sync on every app open (see components/TimeZoneSync.tsx), independent
  // of whether quietHours is enabled. Deliberately not grouped with
  // user_preferences above - unlike subscribedTopics/quietHours this isn't
  // a customer choice, just a detected fact about the device last used.
  timeZone?: string;
  createdAt: Date;
  // Literal last app-open time - set on login/register and again on every
  // native sliding-window session renewal (lib/auth/session.ts). Distinct
  // from SessionDoc.createdAt/expiresAt, which describe the session record
  // itself, not the account. Optional: existing accounts predate this
  // field until they next authenticate.
  lastLoginAt?: Date;
}

export interface SessionDoc {
  _id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface DeviceDoc {
  _id: string; // the FCM/web-push token itself - re-registering the same
  // token is an upsert, never a duplicate.
  userId: string;
  platform: "native" | "web";
  createdAt: Date;
  updatedAt: Date;
  // The Settings screen's "Notifications" master toggle (SRS FR-2.9),
  // tracked per device rather than on UserDoc - a customer's phone and
  // browser each keep their own record, since one may have OS/browser
  // permission and the other may not. Optional and defaults to off; a
  // device that has never turned this on (including one registered before
  // this field existed) has no field at all, same as a fresh registration.
  // Read server-side by fog-push-notification-service as the per-device
  // gate ahead of sending to that device's token - see that repo's
  // src/lib/notification-policy.ts and the job factories under src/jobs/.
  notificationsEnabled?: boolean;
}

export interface JourneyDoc {
  _id: string;
  userId: string;
  journeyDate: Date;
  createdAt: Date;
  // Set once reminder has been sent for this journey, so the
  // reminder job never double-sends.
  reminderSentAt: Date | null;
}

export interface NotificationDoc {
  _id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: Date;
}

export interface PolicyDoc {
  _id: string;
  userId: string;
  displayName: string;
  active: boolean;
  policyNumber?: string;
  coverType?: string;
  startDate?: Date;
  endDate?: Date;
  // Resolved against public/<userId>/<fileName> at download time. That
  // location is a known limitation (see SRS.md Section 12) rather than a
  // deliberate design choice - it is Next.js's static-asset root, served
  // without a per-request auth check.
  fileName: string;
  createdAt: Date;
}
