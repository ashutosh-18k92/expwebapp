"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { BiometricPrimer } from "@/lib/native-permissions";
import { BiometricIcon } from "@/components/PermissionPrimer";

type GateStatus = "checking" | "locked" | "unlocked" | "unsupported";

export function BiometricGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<GateStatus>(enabled ? "checking" : "unsupported");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initial state already accounts for `enabled` - nothing to do if it's off.
    if (!enabled) return;

    let cancelled = false;

    async function checkAvailability() {
      if (!Capacitor.isNativePlatform()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
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
  }, [enabled]);

  async function handleUnlock() {
    setError(null);
    try {
      const result = await BiometricPrimer.authenticate({ title: "Confirm it's you" });
      if (result.success) {
        setStatus("unlocked");
      } else {
        setError(result.error ?? "Biometric check did not succeed.");
      }
    } catch {
      setError("Biometric check is unavailable right now.");
    }
  }

  async function handleLogOut() {
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
