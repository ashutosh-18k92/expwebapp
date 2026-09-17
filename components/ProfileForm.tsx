"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

// Backfill for an account created before firstName/dateOfBirth existed, or
// one that skipped them at registration. No feature currently reads these
// back (see SRS.md FR-2.8) - kept by product decision after the one
// feature that used to need them, PDF password protection, was removed.
export function ProfileForm({
  firstNameInitial,
  dateOfBirthInitial,
}: {
  firstNameInitial: string;
  dateOfBirthInitial: string;
}) {
  const [firstName, setFirstName] = useState(firstNameInitial);
  const [dateOfBirth, setDateOfBirth] = useState(dateOfBirthInitial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("saving");

    const response = await fetch("/api/account/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, dateOfBirth }),
    });

    setStatus(response.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm font-medium">
        First name
        <Input required value={firstName} onChange={(event) => setFirstName(event.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Date of birth
        <Input
          type="date"
          required
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={status === "saving"}
        className="self-start rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {status === "saving" ? "Saving..." : "Save"}
      </button>
      {status === "saved" && <p className="text-sm text-emerald-600">Saved.</p>}
      {status === "error" && <p className="text-sm text-red-600">Couldn&apos;t save. Try again.</p>}
    </form>
  );
}
