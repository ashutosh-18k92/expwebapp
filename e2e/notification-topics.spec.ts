import { test, expect } from "@playwright/test";
import { getSubscribedTopics, deleteTestUser } from "./helpers/db";

/**
 * First E2E test in this repo. Covers: sign in, open Settings, turn on
 * Notifications, toggle the "Promotions" topic on and off, and confirm both
 * the switch UI and the underlying `user_preferences.subscribedTopics`
 * array in MongoDB reflect each change.
 *
 * The one real obstacle is reaching a state where the per-topic toggles
 * render at all: they're gated behind notificationsEnabled, which only
 * becomes true after a real device-token round trip
 * (components/SettingsToggles.tsx -> lib/firebase-web.ts's
 * getWebPushToken()). Two things make that reachable here, both confirmed
 * by hand before writing this test (see playwright.config.ts's comment for
 * the first):
 *   1. Playwright's default headless Chromium ("headless shell") always
 *      reports Notification.permission as "denied" - playwright.config.ts
 *      launches the full Chromium binary instead, where
 *      context.grantPermissions(["notifications"]) works correctly.
 *   2. Chrome deliberately disables the real Push API in any
 *      incognito-style profile (which every Playwright context is) - see
 *      https://crbug.com/41124656 - so PushManager.prototype.subscribe is
 *      replaced with a fake PushSubscription below. Everything downstream
 *      of that (service worker registration, the real Firebase
 *      Installations/Registrations REST calls, this app's own
 *      /api/notifications/device-token and /api/notifications/topics
 *      routes, and the real MongoDB writes) is exercised for real - Google's
 *      real endpoints accept a well-formed fake subscription and mint a
 *      real token, confirmed by hand, so nothing there needs mocking either.
 */

function installFakePushSubscription(context: import("@playwright/test").BrowserContext) {
  return context.addInitScript(() => {
    function b64url(bytes: Uint8Array): string {
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }
    const p256dh = new Uint8Array(65);
    p256dh[0] = 4; // uncompressed EC point prefix
    crypto.getRandomValues(p256dh.subarray(1));
    const auth = new Uint8Array(16);
    crypto.getRandomValues(auth);

    const fakeSubscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/e2e-fake-endpoint-id",
      expirationTime: null,
      getKey(name: string) {
        return name === "p256dh" ? p256dh.buffer : name === "auth" ? auth.buffer : null;
      },
      toJSON() {
        return {
          endpoint: this.endpoint,
          expirationTime: this.expirationTime,
          keys: { p256dh: b64url(p256dh), auth: b64url(auth) },
        };
      },
      unsubscribe: async () => true,
    };

    if (window.PushManager) {
      window.PushManager.prototype.subscribe = async () => fakeSubscription as unknown as PushSubscription;
      window.PushManager.prototype.getSubscription = async () => fakeSubscription as unknown as PushSubscription;
    }
  });
}

async function registerTestUser(
  request: import("@playwright/test").APIRequestContext,
  baseURL: string,
  email: string,
): Promise<string> {
  const response = await request.post(`${baseURL}/api/auth/register`, {
    data: { email, password: "password123", firstName: "E2E", dateOfBirth: "1990-01-01" },
  });
  expect(response.ok(), "registration should succeed for a fresh email").toBeTruthy();
  const setCookie = response.headers()["set-cookie"] ?? "";
  const match = /fog_session=([^;]+)/.exec(setCookie);
  if (!match) throw new Error("register response did not set a fog_session cookie");
  return match[1];
}

test.describe("notification topic toggle", () => {
  const email = `e2e+${Date.now()}@example.com`;

  test.afterAll(async () => {
    await deleteTestUser(email);
  });

  test("toggling a topic updates both the UI and MongoDB", async ({ page, context, request, baseURL }) => {
    const sessionToken = await registerTestUser(request, baseURL!, email);
    await context.addCookies([
      { name: "fog_session", value: sessionToken, url: baseURL! },
    ]);
    await context.grantPermissions(["notifications"]);
    await installFakePushSubscription(context);

    await page.goto("/settings");

    await page.getByRole("switch", { name: "Notifications" }).click();
    await page.getByRole("button", { name: "Enable Notifications" }).click();

    const promotions = page.getByRole("switch", { name: "Promotions" });
    // Generous timeout: this gates on a real round trip through Firebase's
    // Installations + Registrations REST APIs (see the mocking note above),
    // plus - on a cold `next dev` server (first run after a fresh start) -
    // on-demand compilation of /settings and its API routes. Both one-time
    // costs, and both subject to real external network variance (this talks
    // to Google's actual endpoints, not a mock) - confirmed by hand this
    // occasionally exceeds 30s. A flaky failure here is a real external
    // network hiccup, not a sign the toggle/database wiring is broken -
    // retry before treating it as a regression.
    await expect(promotions).toBeVisible({ timeout: 45_000 });
    await expect(promotions).not.toBeChecked();
    await expect.poll(() => getSubscribedTopics(email)).not.toContain("promotions");

    // Same margin and caveat as above.
    const waitForTopicsPost = () =>
      page.waitForResponse((res) => res.url().includes("/api/notifications/topics") && res.request().method() === "POST", {
        timeout: 45_000,
      });

    await Promise.all([waitForTopicsPost(), promotions.click()]);
    await expect(promotions).toBeChecked();
    await expect.poll(() => getSubscribedTopics(email), { timeout: 10_000 }).toContain("promotions");

    await Promise.all([waitForTopicsPost(), promotions.click()]);
    await expect(promotions).not.toBeChecked();
    await expect.poll(() => getSubscribedTopics(email), { timeout: 10_000 }).not.toContain("promotions");
  });
});
