"use client";

import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { PolicyCache } from "@/lib/native-permissions";

export function LogoutButton() {
  const router = useRouter();

  async function handleClick() {
    // A different account may sign in next on this device - it must not
    // inherit this customer's cached policy documents (SRS Section 11,
    // FR-11.5), mirroring BiometricGate.tsx's own logout-time native reset.
    if (Capacitor.isNativePlatform()) {
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
