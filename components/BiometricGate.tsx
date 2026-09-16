"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { BiometricPrimer, LocalSettingsCache } from "@/lib/native-permissions";
import { BiometricIcon } from "@/components/PermissionPrimer";
import { useBiometricGateStore } from "@/lib/biometric-gate-store";

type GateStatus = "checking" | "locked" | "unlocked" | "unsupported";

export function BiometricGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const unlockedThisSession = useBiometricGateStore((state) => state.unlockedThisSession);
  const markUnlocked = useBiometricGateStore((state) => state.markUnlocked);
  const resetUnlocked = useBiometricGateStore((state) => state.reset);

  // `/` (this gate's only mount point) re-mounts BiometricGate on every
  // navigation back to it, which used to reset this to "checking" and
  // re-prompt every time even seconds after the user last unlocked -
  // unlockedThisSession lives in a module-level store instead of component
  // state, so it survives that remount for as long as the app stays open.
  const [status, setStatus] = useState<GateStatus>(() => {
    if (!enabled) return "unsupported";
    return unlockedThisSession ? "unlocked" : "checking";
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initial state already accounts for `enabled`/unlockedThisSession -
    // nothing to (re-)check if either says so.
    if (!enabled || unlockedThisSession) return;

    let cancelled = false;

    async function checkAvailability() {
      if (!Capacitor.isNativePlatform()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }

      // LocalSettingsCache.isUnlocked() is the one flag the native
      // pre-connectivity gate (Android), this gate and the offline islands'
      // own gate all read and write (SRS Section 9) - a device unlocked by
      // any of them is recognised as unlocked by the others without
      // prompting again. No bridge / plugin unreachable falls through to
      // the availability check below exactly as before.
      try {
        const nativeUnlock = await LocalSettingsCache.isUnlocked();
        if (nativeUnlock.unlocked) {
          if (!cancelled) {
            markUnlocked();
            setStatus("unlocked");
          }
          return;
        }
      } catch {
        // fall through
      }
      if (cancelled) return;

      try {
        const result = await BiometricPrimer.isAvailable();
        if (!cancelled) setStatus(result.available ? "locked" : "unsupported");
      } catch {
        if (!cancelled) setStatus("unsupported");
      }
    }

    checkAvailability();
    return () => {
      cancelled = true;
    };
  }, [enabled, unlockedThisSession, markUnlocked]);

  async function handleUnlock() {
    setError(null);
    try {
      const result = await BiometricPrimer.authenticate({ title: "Confirm it's you" });
      if (result.success) {
        markUnlocked();
        LocalSettingsCache.markUnlocked().catch(() => {});
        setStatus("unlocked");
      } else {
        setError(result.error ?? "Biometric check did not succeed.");
      }
    } catch {
      setError("Biometric check is unavailable right now.");
    }
  }

  async function handleLogOut() {
    // A different account may sign in next on this device/session - it
    // must not inherit this unlock. Also clears the offline gate's native,
    // process-lifetime unlock flag (SRS FR-9.2) for the same reason: that
    // flag is separate from this JS store and would otherwise survive a
    // sign-out within the same running app process.
    resetUnlocked();
    if (Capacitor.isNativePlatform()) {
      await LocalSettingsCache.resetUnlock().catch(() => {});
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (status === "checking") return null;
  if (status === "unsupported" || status === "unlocked") return <>{children}</>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5">
      <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] bg-[#F6F5F2] px-6 pt-9 pb-8 text-center">
        <div className="mb-7 flex h-22 w-22 items-center justify-center rounded-full border-2 border-[#BAE6FD] bg-[#E0F2FE]">
          <BiometricIcon />
        </div>
        <h2 className="mb-4 font-serif text-[26px] leading-snug font-bold text-[#0F172A]">
          Confirm it&apos;s you
        </h2>
        <p className="mb-8 text-[15px] leading-relaxed text-[#334155]">
          Use your fingerprint or face to unlock this page.
        </p>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          onClick={handleUnlock}
          className="mb-4 flex h-[54px] w-full items-center justify-center rounded-full bg-[#1F9D67] text-base font-bold text-white transition-colors hover:bg-[#187F53] active:bg-[#187F53]"
        >
          Unlock with biometrics
        </button>
        <button onClick={handleLogOut} className="p-2 text-[15px] font-bold text-[#1E293B] underline">
          Log out instead
        </button>
      </div>
    </div>
  );
}
