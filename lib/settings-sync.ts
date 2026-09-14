const PENDING_KEY = "fog:settings-pending-writes:v1";

interface PendingWrite {
  /** Logical field identifier, e.g. "quiet-hours", "biometric", "topic:essentials" - a newer write for the same key supersedes an older, not-yet-confirmed one. */
  key: string;
  endpoint: string;
  body: Record<string, unknown>;
  /** For observability only - retries are never capped, see flushPendingSettingsWrites. */
  attempts: number;
}

function readPending(): PendingWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingWrite[]) : [];
  } catch {
    return [];
  }
}

function writePending(writes: PendingWrite[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify(writes));
  } catch {
    // Best-effort - worst case this specific write is never retried later,
    // but the immediate POST attempt below still fires normally.
  }
}

async function attemptWrite(write: PendingWrite): Promise<boolean> {
  try {
    const response = await fetch(write.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(write.body),
      // Lets the request finish even if the tab/WebView is torn down right
      // after it's sent (a real page unload, app close/background) - a
      // plain client-side route change (e.g. this app's back button)
      // doesn't need this at all, since it never interrupts an in-flight
      // fetch in the first place.
      keepalive: true,
    });
    if (response.ok) {
      writePending(readPending().filter((existing) => existing.key !== write.key));
      return true;
    }
  } catch {
    // Network error - left pending, see flushPendingSettingsWrites.
  }
  writePending(
    readPending().map((existing) => (existing.key === write.key ? { ...existing, attempts: existing.attempts + 1 } : existing)),
  );
  return false;
}

/**
 * Optimistic settings write. The caller updates its own UI state and the
 * settings cache (lib/settings-cache.ts) *before* calling this - this only
 * owns getting `body` to `endpoint` reliably despite the caller possibly
 * navigating away (or the app closing) before the request completes: the
 * write is recorded first, so if it fails outright (offline, server error,
 * or the app is gone before a response ever arrives), the next call to
 * flushPendingSettingsWrites - on the next mount of any page that makes
 * these writes, or the dashboard - retries it. Recording the same `key`
 * again (e.g. the user flips the same toggle again before the first write
 * lands) replaces the earlier pending write rather than queueing both, so
 * a stale value is never replayed over a newer one.
 *
 * Returns whether the write is confirmed saved, for a caller that's still
 * mounted to give best-effort feedback - a component that isn't mounted
 * any more just doesn't do anything with the answer, which is fine: the
 * pending-write record is what carries responsibility for eventually
 * saving it, not this promise.
 */
export async function writeSettingOptimistically(
  key: string,
  endpoint: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const pending = readPending().filter((existing) => existing.key !== key);
  const write: PendingWrite = { key, endpoint, body, attempts: 0 };
  pending.push(write);
  writePending(pending);

  return attemptWrite(write);
}

/**
 * Retries every settings write that hasn't been confirmed saved yet -
 * e.g. one left over from a session that ended (navigation, app close,
 * lost connectivity) before its POST ever got a response. Never gives up
 * after some number of attempts: an occasional settings save is cheap
 * enough to keep retrying indefinitely on mount rather than silently
 * abandoning the user's actual intent.
 */
export async function flushPendingSettingsWrites(): Promise<void> {
  await Promise.all(readPending().map((write) => attemptWrite(write)));
}
