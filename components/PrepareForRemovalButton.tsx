"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { LocalSettingsCache, PolicyCache } from "@/lib/native-permissions";
import { useBiometricGateStore } from "@/lib/biometric-gate-store";

/**
 * SRS Section 12, FR-12.2. Neither platform gives an app a hook that runs as
 * it's being uninstalled, so this isn't (and can't be) tied to an actual
 * uninstall - it's an explicit action a customer takes before removing the
 * app or handing this device to someone else, clearing every native,
 * on-device record this app holds (LocalSettingsCache's biometric-enabled
 * flag and unlock state, FR-9.1/FR-9.2; PolicyCache's saved policy
 * documents, FR-11.5) rather than leaving them for whoever uses this device
 * next. Native only: on web there's no equivalent on-device cache beyond the
 * session cookie, which a plain sign-out already clears.
 */
export function PrepareForRemovalButton({ isNativeInitial }: { isNativeInitial: boolean }) {
  const router = useRouter();
  const resetUnlocked = useBiometricGateStore((state) => state.reset);
  // Same isNativeInitial/useEffect split BiometricGate.tsx and
  // SettingsToggles.tsx use - Capacitor.isNativePlatform() answers
  // differently on the server than during client hydration, so it can't be
  // called directly during the first render without risking the same
  // hydration mismatch fixed under FR-9.6.
  const [isNative, setIsNative] = useState(isNativeInitial);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.resolve().then(() => {
      const actual = Capacitor.isNativePlatform();
      setIsNative((prev) => (prev === actual ? prev : actual));
    });
  }, []);

  if (!isNative) return null;

  async function handleConfirm() {
    setError(null);
    resetUnlocked();
    try {
      await LocalSettingsCache.setBiometricEnabled({ enabled: false });
      await LocalSettingsCache.resetUnlock();
      await PolicyCache.clearCache();
    } catch {
      setError("Couldn't clear everything on this device. You can still sign out and try again.");
      return;
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-slate-300 p-4">
        <p className="text-sm text-slate-700">
          This signs you out and clears your saved policy documents and sign-in preferences from this device. Use it
          before uninstalling the app, or before handing this device to someone else.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Sign out and clear this device
          </button>
          <button onClick={() => setConfirming(false)} className="px-4 py-2 text-sm font-semibold text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="self-start text-sm font-semibold text-slate-600 underline"
    >
      Sign out and prepare for removal
    </button>
  );
}
