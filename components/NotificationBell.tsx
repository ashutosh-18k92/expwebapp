"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { NotificationIcon } from "@/components/PermissionPrimer";

interface NotificationItem {
  _id: string;
  title: string;
  body: string;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  async function load() {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.notifications);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/notifications")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) setItems(data.notifications);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next) await load();
  }

  async function handleDismiss(id: string) {
    setItems((prev) => prev?.filter((item) => item._id !== id) ?? prev);
    await fetch(`/api/notifications/${id}`, { method: "DELETE" });
  }

  async function handleClearAll() {
    setItems([]);
    await fetch("/api/notifications", { method: "DELETE" });
  }

  const count = items?.length ?? 0;

  return (
    <div className="relative">
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        className="relative flex h-10 w-10 items-center justify-center rounded-full hover:bg-slate-100"
      >
        <NotificationIcon className="h-6 w-6" />
        {count > 0 && (
          <span className="absolute top-0 right-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Notifications</h2>
            {count > 0 && (
              <button onClick={handleClearAll} className="text-xs font-semibold text-slate-500 underline">
                Clear all
              </button>
            )}
          </div>

          {items === null && <p className="text-sm text-slate-500">Loading...</p>}
          {items !== null && items.length === 0 && (
            <p className="text-sm text-slate-500">No notifications yet.</p>
          )}

          <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
            {items?.map((item) => (
              <li key={item._id} className="rounded-lg border border-slate-100 p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-sm text-slate-600">{item.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismiss(item._id)}
                    aria-label="Dismiss"
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
