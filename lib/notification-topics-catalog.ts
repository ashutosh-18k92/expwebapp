/**
 * Dependency-free shared shape for the notification_topics catalog - no
 * "use client", no mongodb import - so it's importable from Server
 * Components, Route Handlers, and client components alike. This repo's
 * convention is that client components never import lib/db.ts, even for
 * types, which is why this lives separately from the Mongo doc type
 * (NotificationTopicDoc, lib/db.ts) it's embedded in.
 */
export interface NotificationTopicCatalogEntry {
  _id: string; // slug, e.g. "essentials" - also the subscribedTopics array element
  displayName: string; // Settings toggle label - DRAFT, Compliance sign-off required
  description: string; // Settings toggle caption - DRAFT, Compliance sign-off required
  sortOrder: number; // stable UI ordering
  defaultSubscribed: boolean; // seeded into a new user's subscribedTopics at registration
  nativeAndroidTopic: boolean; // true only for ids the native Android whitelist still recognises (today: all three)
}

export function defaultSubscribedTopicIds(catalog: NotificationTopicCatalogEntry[]): string[] {
  return catalog.filter((topic) => topic.defaultSubscribed).map((topic) => topic._id);
}

export function nativeSupportedTopicIds(catalog: NotificationTopicCatalogEntry[]): string[] {
  return catalog.filter((topic) => topic.nativeAndroidTopic).map((topic) => topic._id);
}
