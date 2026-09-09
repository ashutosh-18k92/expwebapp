"use client";

import { Switch } from "@/components/ui/switch";

export function Toggle({
  label,
  caption,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  caption?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-800 py-4 last:border-b-0">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {caption && <p className="text-xs text-slate-500">{caption}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}
