// Runs before both `pnpm build` and `pnpm dev` (see package.json) to stamp
// build-version.json with the current moment - the "build version" shown on
// the Settings page is when this code was last built/started, not a
// hand-maintained counter. Generated fresh every run, so build-version.json
// is gitignored rather than committed - there's nothing meaningful to diff
// or merge in a timestamp that changes on every single build.
//
// Run with: node scripts/write-build-version.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../build-version.json", import.meta.url));

writeFileSync(path, `${JSON.stringify({ builtAt: new Date().toISOString() }, null, 2)}\n`);
