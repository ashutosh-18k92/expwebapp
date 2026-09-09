import Link from "next/link";
import type { ReactNode } from "react";

export function DashboardCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-2xl border border-slate-200 p-4 transition-colors hover:border-slate-400"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[#BAE6FD] bg-[#E0F2FE]">
        {icon}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </Link>
  );
}
