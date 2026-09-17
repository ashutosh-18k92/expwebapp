// One-off dev helper: writes the "policies" MongoDB metadata for the two
// test files under public/<userId>/ used to develop the My Policies screen.
// There is no admin/back-office authoring flow yet (see SRS.md Section 12),
// so this is how those two records get created. Edit POLICIES to match real
// dev-account user ids and file names before running, and edit the
// policyNumber/coverType/date placeholders to whatever you want to test with.
//
// Run with: node --env-file=.env.local scripts/seed-policies.mjs

import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";

const POLICIES = [
  {
    userId: "08fe8ab5-e9b4-4ffd-8e73-f2eb3ca5b30e",
    fileName: "policy-laura-211136.pdf",
    displayName: "Single trip travel insurance",
    active: true,
    policyNumber: "PLACEHOLDER-211136",
    coverType: "Single trip",
  },
  {
    userId: "6470e214-8eb3-4fa3-948d-1bb814e3d243",
    fileName: "policy-jacob-556895.pdf",
    displayName: "Annual multi-trip travel insurance",
    active: true,
    policyNumber: "PLACEHOLDER-556895",
    coverType: "Annual multi-trip",
  },
   {
    userId: "2d4481cd-55bb-4fec-8011-9e1290119c88",
    fileName: "stacy.pdf",
    displayName: "Annual multi-trip travel insurance",
    active: true,
    policyNumber: "PLACEHOLDER-556895",
    coverType: "Annual multi-trip",
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

for (const { userId, fileName, ...rest } of POLICIES) {
  await db
    .collection("policies")
    .updateOne(
      { userId, fileName },
      { $set: { userId, fileName, ...rest }, $setOnInsert: { _id: randomUUID(), createdAt: new Date() } },
      { upsert: true },
    );
  console.log(`Upserted policy for user ${userId} (${fileName})`);
}

await client.close();
