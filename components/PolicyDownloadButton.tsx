"use client";

import { useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PolicyCache } from "@/lib/native-permissions";

function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot);
}

/**
 * Web: a plain browser download - the file already sits under Next.js's
 * public/ static root (SRS Section 12's storage-location limitation), so no
 * server route is needed to serve it.
 *
 * Native: a plain `<a download>` is not reliable inside a Capacitor WebView
 * (there is no registered DownloadListener), and a browser-style download
 * would not be readable back by the offline island anyway (fog-mobile-app's
 * islands share no storage with this origin). So native gets a single
 * "Save for offline use" action that calls PolicyCachePlugin instead: it
 * fetches the file natively and writes it to this app's own private
 * storage, then hands it straight to the device's PDF viewer to confirm it
 * worked - the same document is then listed on the islands "My policies"
 * tab (fog-mobile-app) with no connection needed.
 */
export function PolicyDownloadButton({
  userId,
  fileName,
  displayName,
  active,
  policyNumber,
  coverType,
  startDate,
  endDate,
}: {
  userId: string;
  fileName: string;
  displayName: string;
  active: boolean;
  policyNumber?: string;
  coverType?: string;
  startDate?: string;
  endDate?: string;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const path = `/${userId}/${fileName}`;

  if (!Capacitor.isNativePlatform()) {
    return (
      <a
        href={path}
        download={`${displayName}${fileExtension(fileName)}`}
        className="self-start rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
      >
        Download
      </a>
    );
  }

  async function handleSaveOffline() {
    setStatus("saving");
    try {
      await PolicyCache.cacheFile({ path, displayName, active, policyNumber, coverType, startDate, endDate });
      setStatus("saved");
      await PolicyCache.openFile({ fileName }).catch(() => {});
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleSaveOffline}
        disabled={status === "saving"}
        className="self-start rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-60"
      >
        {status === "saving" ? "Saving for offline use..." : status === "saved" ? "Saved for offline use" : "Save for offline use"}
      </button>
      {status === "error" && (
        <p className="text-xs text-red-600">Couldn&apos;t save this for offline use. Try again.</p>
      )}
    </div>
  );
}
