import { readFileSync } from "node:fs";
import path from "node:path";

// build-version.json is stamped fresh by scripts/write-build-version.mjs on
// every `pnpm dev`/`pnpm build` (see package.json) - it's gitignored, not
// committed, since a timestamp changes on every run and there's nothing
// meaningful to track in git. Read directly from disk (this is only ever
// called from a Server Component) rather than threaded through
// next.config.ts's env inlining, so this needs no separate client-bundling
// step.
export function getBuildVersion(): { appVersion: string; builtAt: string } {
  const root = process.cwd();
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

  let builtAt = "unknown";
  try {
    const buildVersion = JSON.parse(readFileSync(path.join(root, "build-version.json"), "utf8"));
    // en-GB + a fixed time zone, rather than the server host's own locale/
    // zone, so this reads the same regardless of where it's deployed.
    builtAt = new Date(buildVersion.builtAt).toLocaleString("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/London",
    });
  } catch {
    // Missing until the first `pnpm dev`/`pnpm build` run writes it (e.g. a
    // fresh checkout where `next dev`/`next build` was invoked directly,
    // bypassing the package.json script) - fall back rather than crashing
    // the Settings page over a display-only value.
  }

  return { appVersion: pkg.version, builtAt };
}
