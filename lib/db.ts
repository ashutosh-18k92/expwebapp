import { MongoClient, ServerApiVersion, type Db } from "mongodb";

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

export interface NotificationTopicPreferences {
  essentials: boolean;
  promotions: boolean;
  feeds: boolean;
}

export interface QuietHoursSettings {
  enabled: boolean;
  startTime: string; // "HH:mm", local wall-clock
  endTime: string; // "HH:mm"; numerically before startTime means an
  // overnight window (e.g. 22:00 -> 07:00)
}

export interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  biometricEnabled: boolean;
  notificationTopics: NotificationTopicPreferences;
  quietHours?: QuietHoursSettings;
  // IANA identifier, e.g. "Europe/London" - kept current by a client-side
  // sync on every app open (see components/TimeZoneSync.tsx), independent
  // of whether quietHours is enabled.
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
