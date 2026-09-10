import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

// Public web app config - safe to embed in client bundles, same values as
// public/firebase-messaging-sw.js. Not a secret; see lib/firebase-admin.ts
// for the actual credential (server-only).
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}

/**
 * Mints a web push registration token, or null if unsupported, denied, or
 * not yet configured. Requires NEXT_PUBLIC_FIREBASE_VAPID_KEY (Firebase
 * console -> Project Settings -> Cloud Messaging -> Web configuration) -
 * this is a distinct value from the app config above and isn't set yet, so
 * this currently always returns null with a console warning until it is.
 */
export async function getWebPushToken(): Promise<string | null> {
  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn(
      "getWebPushToken: NEXT_PUBLIC_FIREBASE_VAPID_KEY is not set - web push is scaffolded but not configured yet.",
    );
    return null;
  }

  if (!(await isSupported())) return null;

  try {
    const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const messaging = getMessaging(getFirebaseApp());
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    return token || null;
  } catch (error) {
    console.warn("getWebPushToken: failed to obtain a token", error);
    return null;
  }
}
