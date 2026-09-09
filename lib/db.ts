import { MongoClient, ServerApiVersion, type Db } from "mongodb";

const DB_NAME = process.env.MONGODB_DB_NAME || "fog_exp_webapp";
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

export interface UserDoc {
  _id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  biometricEnabled: boolean;
  notificationTopics: NotificationTopicPreferences;
  createdAt: Date;
  // Latest Android FCM registration token, used to target this user with a
  // single-device push (see /api/notifications/device-token and
  // fog-push-notification-service's journey-reminder job). One token per
  // user, not per-device - a user signed in on two devices only gets pushes
  // on whichever registered most recently.
  fcmToken?: string | null;
  fcmTokenUpdatedAt?: Date | null;
}

export interface SessionDoc {
  _id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface JourneyDoc {
  _id: string;
  userId: string;
  journeyDate: Date;
  createdAt: Date;
  // Set once the 14-day-out reminder has been sent for this journey, so the
  // reminder job never double-sends. See fog-push-notification-service's
  // journey-reminder job.
  reminderSentAt: Date | null;
}

export interface NotificationDoc {
  _id: string;
  userId: string;
  title: string;
  body: string;
  createdAt: Date;
}
