// Firebase Web Push background handler. Must live at the origin root (not
// under a subpath) for the default push scope. Config here is duplicated
// from lib/firebase-web.ts - service workers are static files, not part of
// the Next.js/webpack bundle, so they can't read NEXT_PUBLIC_* env vars at
// runtime. These values are public app config, not secrets - see
// lib/firebase-admin.ts for the actual (server-only) credential.
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDBgrLm1A81dGRmJwxM7U8vX4kNVl6R_BM",
  authDomain: "xenon-notifications-8babe.firebaseapp.com",
  projectId: "xenon-notifications-8babe",
  storageBucket: "xenon-notifications-8babe.firebasestorage.app",
  messagingSenderId: "884956305077",
  appId: "1:884956305077:web:ec2a7c981846d9902a50fc",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? "Notification";
  const body = payload.notification?.body ?? "";
  self.registration.showNotification(title, { body });
});
