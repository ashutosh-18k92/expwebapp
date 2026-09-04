/**
 * Contract for identifying the Capacitor native shell to the rest of the app.
 * Dependency-free (no `next/server`, `next/headers`) so it can be imported
 * from both `proxy.ts` and server code without pulling in extras.
 *
 * Naming matches fog-experience-customer-web's
 * `src/core/config/native-client.config.ts` - same header, same cookie name.
 *
 * Flow: the native shell (see fog-mobile-app's MainActivity.java) sends
 * {@link FOG_NATIVE_HEADER} only on the cold-launch load of
 * `capacitor.config.ts`'s `server.url` - there's no hook to attach a header
 * to every later request. `proxy.ts` reads it once and persists the raw
 * value as {@link FOG_NATIVE_CLIENT_COOKIE}; every later request, including
 * the auth API calls, carries the cookie automatically.
 */

/** Sent once, by the native shell only, on the cold-launch page load. Value is 'android' | 'ios'. */
export const FOG_NATIVE_HEADER = "x-fog-native-client";

/** Persistent httpOnly cookie proxy.ts drops after reading FOG_NATIVE_HEADER. */
export const FOG_NATIVE_CLIENT_COOKIE = "fog_native_client";
