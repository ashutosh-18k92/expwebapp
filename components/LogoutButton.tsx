"use client";

import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { LocalSettingsCache, PolicyCache } from "@/lib/native-permissions";
import { useBiometricGateStore } from "@/lib/biometric-gate-store";

export function LogoutButton() {
  const router = useRouter();
  const resetUnlocked = useBiometricGateStore((state) => state.reset);

  async function handleClick() {
    // A different account may sign in next on this device - it must not
    // inherit this customer's unlocked gate or cached policy documents
    // (SRS Section 9/11, FR-9.2/FR-11.5), mirroring BiometricGate.tsx's own
    // handleLogOut. This button previously only cleared PolicyCache, leaving
    // the native process-lifetime unlock flag (and this JS store) standing
    // for whoever opened the app next on this device/tab - fixed as part of
    // SRS FR-12.2.
    resetUnlocked();
    if (Capacitor.isNativePlatform()) {
      await LocalSettingsCache.resetUnlock().catch(() => {});
      await PolicyCache.clearCache().catch(() => {});
    }
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <button
      onClick={handleClick}
      className="self-start rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
    >
      Log out
    </button>
  );
}
