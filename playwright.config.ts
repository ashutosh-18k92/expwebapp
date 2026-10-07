import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

// `next dev` (the webServer below) loads .env.local itself - this is for
// this config/test process's own direct Mongo access (e2e/helpers/db.ts),
// which Next.js's env loading doesn't cover.
process.loadEnvFile(".env.local");

/**
 * Playwright's default headless Chromium launch uses the stripped-down
 * "headless shell" build, which hard-reports Notification.permission as
 * "denied" regardless of context.grantPermissions/newContext({permissions}) -
 * confirmed by hand (neither `--headless=new` alone nor
 * PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW=1 fixes it; only launching the full
 * "chrome-linux64/chrome" binary does). The notification-topic toggle test
 * needs real Notification permission state, so this finds that full binary
 * in Playwright's browser cache rather than the headless-shell one -
 * resolved by directory scan (not a hardcoded version) so it survives a
 * `playwright install` version bump. Falls back to undefined (Playwright's
 * own default resolution) if the cache layout ever doesn't match this.
 */
function resolveFullChromiumExecutable(): string | undefined {
  const cacheRoot = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), ".cache", "ms-playwright");
  if (!existsSync(cacheRoot)) return undefined;
  const candidates = readdirSync(cacheRoot)
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const dir of candidates) {
    const exe = join(cacheRoot, dir, "chrome-linux64", "chrome");
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

// First-ever automated test setup in this repo (see e2e/notification-topics.spec.ts).
// Runs against a real `next dev` server and the real dev Mongo database
// (.env.local) - there's no separate test database/mode yet.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // One retry: the toggle test talks to real Google Firebase endpoints
  // (see its own doc comment) with occasional real network latency spikes -
  // this absorbs that without masking an actual logic regression, which
  // would fail consistently rather than intermittently.
  retries: 1,
  timeout: 90_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: resolveFullChromiumExecutable(),
      args: ["--headless=new"],
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
