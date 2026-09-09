"use client";

import { useEffect, useState } from "react";

interface JourneyItem {
  _id: string;
  journeyDate: string;
}

export function JourneyForm() {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [journeys, setJourneys] = useState<JourneyItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/journeys");
    if (!response.ok) return;
    const data = await response.json();
    setJourneys(data.journeys);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/journeys")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setJourneys(data.journeys);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!date || !time) {
      setError("Enter both a date and a time.");
      return;
    }

    const response = await fetch("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, time }),
    });

    if (!response.ok) {
      setError("Couldn't save that journey date. Try again.");
      return;
    }

    setDate("");
    setTime("");
    await load();
  }

  async function handleCancel(id: string) {
    setJourneys((prev) => prev?.filter((journey) => journey._id !== id) ?? prev);
    await fetch(`/api/journeys/${id}`, { method: "DELETE" });
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Journey date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
          Departure time
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          className="self-start rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Schedule journey
        </button>
      </form>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-900">Upcoming journeys</h2>
        {journeys === null && <p className="text-sm text-slate-500">Loading...</p>}
        {journeys !== null && journeys.length === 0 && (
          <p className="text-sm text-slate-500">No journeys scheduled yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {journeys?.map((journey) => (
            <li
              key={journey._id}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="text-sm text-slate-700">
                {new Date(journey.journeyDate).toLocaleString()}
              </span>
              <button
                onClick={() => handleCancel(journey._id)}
                className="text-xs font-semibold text-slate-500 underline"
              >
                Cancel
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
