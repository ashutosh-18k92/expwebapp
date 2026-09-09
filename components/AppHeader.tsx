"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";

/**
 * Persistent chrome mounted in the root layout, so it appears on every page.
 * Back uses browser history (there's no per-page hierarchy to hardcode), and
 * Dashboard is a one-tap way back to the signed-in landing page from
 * anywhere - if the visitor isn't signed in, it just redirects to /login the
 * same way visiting /dashboard directly does.
 */
export function AppHeader() {
  const router = useRouter();

  return (
    <header className="flex items-center justify-between px-4 py-3">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back"
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <Link
        href="/dashboard"
        aria-label="Dashboard"
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
      >
        <LayoutDashboard className="h-5 w-5" />
      </Link>
    </header>
  );
}
