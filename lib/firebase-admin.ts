import { type App, type ServiceAccount, cert, getApps, initializeApp } from "firebase-admin/app";

/**
 * Initialises the Admin SDK exactly once, from FIREBASE_SERVICE_ACCOUNT_BASE64
 * - same pattern as fog-push-notification-service's src/config/firebase.ts,
 * same project ("xenon-notifications-8babe"). Used for server-side topic
 * (un)subscription of web push devices - see lib/notification-topics-admin.ts.
 * Native devices subscribe themselves client-side and never touch this.
 */
export function initFirebaseAdmin(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  return initializeApp({ credential: cert(loadServiceAccount()) });
}

function loadServiceAccount(): ServiceAccount {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!base64) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 is not set - add it to .env.local for local dev, or the deployment's environment variables.",
    );
  }
  try {
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8")) as ServiceAccount;
  } catch (cause) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded JSON", { cause });
  }
}
