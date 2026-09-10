import { existsSync } from "node:fs";
import { type App, cert, getApps, initializeApp } from "firebase-admin/app";

/**
 * Initialises the Admin SDK exactly once, from the service account file on
 * disk - same pattern as fog-push-notification-service's
 * src/config/firebase.ts, same project ("xenon-notifications-8babe"). Used
 * for server-side topic (un)subscription of web push devices - see
 * lib/notification-topics-admin.ts. Native devices subscribe themselves
 * client-side and never touch this.
 */
export function initFirebaseAdmin(): App {
  const existing = getApps()[0];
  if (existing) return existing;

  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_PATH is not set - add it to .env.local for local dev, or the deployment's environment variables.",
    );
  }
  if (!existsSync(path)) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_PATH points to a file that doesn't exist: ${path}`);
  }

  return initializeApp({ credential: cert(path) });
}
