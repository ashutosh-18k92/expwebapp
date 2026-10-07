// One-off migration: moves the notification topic catalog out of code
// (lib/native-permissions.ts's old NOTIFICATION_CATEGORIES, lib/db.ts's old
// NotificationTopicPreferences) and into the new notification_topics
// collection, then converts each user's preferences.notificationTopics
// boolean map into preferences.subscribedTopics: string[]. Run once per
// brand deployment - each brand is its own database, so this script only
// ever touches the one its own .env.local points at. Delete this file once
// it's been run and verified against that brand's database, same as the
// now-deleted scripts/migrate-user-preferences.mjs (see SRS.md) - record
// what ran, when, and against which database there in its place.
//
// Run with: node --env-file=.env.local scripts/migrate-notification-topics.mjs

import { MongoClient } from "mongodb";

// Carried over verbatim from SettingsToggles.tsx's hardcoded JSX before this
// migration - still DRAFT, still needs Compliance sign-off before any
// wording changes (see lib/notification-topics-catalog.ts).
const SEED_TOPICS = [
  {
    _id: "essentials",
    displayName: "Essentials",
    description: "Claims updates, policy and renewal reminders.",
    sortOrder: 1,
    defaultSubscribed: true,
    nativeAndroidTopic: true,
    // Matches fog-push-notification-service's src/config/env.ts defaults
    // today (ENABLE_<BRAND>_<CATEGORY>_BROADCAST_JOB: false,
    // <BRAND>_<CATEGORY>_BROADCAST_CRON: "0 9 * * *") - no schedule or
    // enablement behaviour changes at migration time.
    cron: "0 9 * * *",
    enabled: false,
  },
  {
    _id: "promotions",
    displayName: "Promotions",
    description: "Offers and marketing updates.",
    sortOrder: 2,
    defaultSubscribed: false,
    nativeAndroidTopic: true,
    cron: "0 9 * * *",
    enabled: false,
  },
  {
    _id: "feeds",
    displayName: "Feeds",
    description: "Travel tips and destination content.",
    sortOrder: 3,
    defaultSubscribed: false,
    nativeAndroidTopic: true,
    cron: "0 9 * * *",
    enabled: false,
  },
];

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI is not set - run with --env-file=.env.local or export it first.");
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(process.env.MONGODB_DB_NAME || "exp_webapp");

// Phase 1: idempotent upsert of the catalog itself.
const now = new Date();
for (const { _id, ...rest } of SEED_TOPICS) {
  await db
    .collection("notification_topics")
    .updateOne(
      { _id },
      { $set: { ...rest, updatedAt: now }, $setOnInsert: { _id, createdAt: now } },
      { upsert: true },
    );
  console.log(`Upserted notification_topics/${_id}`);
}

// Phase 2: convert each user's boolean-map preference into an array. The
// $exists filter makes this safe to re-run - already-migrated docs (which no
// longer have notificationTopics) are excluded.
const cursor = db.collection("users").find({ "preferences.notificationTopics": { $exists: true } });
let migrated = 0;
for await (const user of cursor) {
  const topics = user.preferences?.notificationTopics ?? {};
  const subscribedTopics = Object.entries(topics)
    .filter(([, value]) => value === true)
    .map(([id]) => id);
  await db.collection("users").updateOne(
    { _id: user._id },
    {
      $set: { "preferences.subscribedTopics": subscribedTopics },
      $unset: { "preferences.notificationTopics": "" },
    },
  );
  migrated += 1;
}
console.log(`Migrated ${migrated} user doc(s) from preferences.notificationTopics to preferences.subscribedTopics`);

await client.close();
