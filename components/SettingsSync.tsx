"use client";

import { useEffect } from "react";
import { flushPendingSettingsWrites } from "@/lib/settings-sync";

/**
 * No UI. Retries any optimistic settings write (see lib/settings-sync.ts)
 * that didn't get confirmed before the page it started from was left -
 * mounted here since the dashboard is the page every session visits first,
 * in addition to SettingsToggles' own mount effect for a direct reopen of
 * Settings.
 */
export function SettingsSync() {
  useEffect(() => {
    flushPendingSettingsWrites();
  }, []);

  return null;
}
