import { MongoClient } from "mongodb";

// Same idiom as scripts/seed-policies.mjs / scripts/migrate-notification-topics.mjs -
// plain driver, no pooling abstraction, connect fresh and close per call. A
// test spec is the only caller, so there's no need for a shared/cached
// client the way lib/db.ts has for the running app.
async function withDb<T>(fn: (db: import("mongodb").Db) => Promise<T>): Promise<T> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set - playwright.config.ts should have loaded it from .env.local.");
  }
  const client = new MongoClient(uri);
  await client.connect();
  try {
    return await fn(client.db(process.env.MONGODB_DB_NAME || "exp_webapp"));
  } finally {
    await client.close();
  }
}

export async function getSubscribedTopics(email: string): Promise<string[] | undefined> {
  return withDb(async (db) => {
    const user = await db.collection("users").findOne({ email });
    if (!user) return undefined;
    const preferences = await db.collection("user_preferences").findOne({ _id: user._id });
    return preferences?.subscribedTopics;
  });
}

/** Removes the disposable test account and any device/preferences row it registered. */
export async function deleteTestUser(email: string): Promise<void> {
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email });
    if (!user) return;
    await db.collection("devices").deleteMany({ userId: user._id });
    await db.collection("user_preferences").deleteOne({ _id: user._id });
    await db.collection("users").deleteOne({ _id: user._id });
  });
}
