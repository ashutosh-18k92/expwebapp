"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PolicyCache } from "@/lib/native-permissions";

/**
 * Web: emails a copy of the document to the customer's own registered
 * address (app/api/policies/[id]/email/route.ts), rather than a plain
 * browser download - judged unsafe for this kind of document (SRS Section
 * 11).
 *
 * Native: unrelated and unchanged by that requirement - "Save for offline
 * use" still fetches the file straight into the app's own on-device
 * sandbox (PolicyCachePlugin, FR-11.5), a different threat model neither
 * this nor that requirement touches.
 */
export function PolicyDeliveryButton({
  policyId,
  userId,
  fileName,
  displayName,
  active,
  policyNumber,
  coverType,
  startDate,
  endDate,
}: {
  policyId: string;
  userId: string;
  fileName: string;
  displayName: string;
  active: boolean;
  policyNumber?: string;
  coverType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const isNative = Capacitor.isNativePlatform();

  async function handleSaveOffline() {
    setStatus("busy");
    setError(null);
    try {
      await PolicyCache.cacheFile({
        path: `/${userId}/${fileName}`,
        displayName,
        active,
        policyNumber,
        coverType,
        startDate,
        endDate,
      });
      setStatus("done");
      await PolicyCache.openFile({ fileName }).catch(() => {});
    } catch {
      setStatus("error");
      setError("Couldn't save this for offline use. Try again.");
    }
  }

  async function handleEmail() {
    setStatus("busy");
    setError(null);
    const response = await fetch(`/api/policies/${policyId}/email`, { method: "POST" });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus("error");
      setError(data?.error ?? "Couldn't send that document. Try again.");
      return;
    }
    setStatus("done");
  }

  const label = isNative
    ? { idle: "Save for offline use", busy: "Saving for offline use...", done: "Saved for offline use" }
    : { idle: "Email me this document", busy: "Sending...", done: "Sent to your email" };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={isNative ? handleSaveOffline : handleEmail}
        disabled={status === "busy"}
        className="self-start rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
      >
        {status === "busy" ? label.busy : status === "done" ? label.done : label.idle}
      </button>
      {status === "error" && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
