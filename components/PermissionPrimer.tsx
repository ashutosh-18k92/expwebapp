"use client";

interface PermissionPrimerProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  allowLabel: string;
  onAllow: () => void;
  onDismiss: () => void;
}

export function PermissionPrimer({
  icon,
  title,
  description,
  allowLabel,
  onAllow,
  onDismiss,
}: PermissionPrimerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-5">
      <div className="flex w-full max-w-sm flex-col items-center rounded-[28px] bg-[#F6F5F2] px-6 pt-9 pb-8 text-center">
        <div className="mb-7 flex h-22 w-22 items-center justify-center rounded-full border-2 border-[#BAE6FD] bg-[#E0F2FE]">
          {icon}
        </div>
        <h2 className="mb-4 font-serif text-[26px] leading-snug font-bold text-[#0F172A]">
          {title}
        </h2>
        <p className="mb-8 text-[15px] leading-relaxed text-[#334155]">{description}</p>
        <button
          onClick={onAllow}
          className="mb-4 flex h-[54px] w-full items-center justify-center rounded-full bg-[#1F9D67] text-base font-bold text-white transition-colors hover:bg-[#187F53] active:bg-[#187F53]"
        >
          {allowLabel}
        </button>
        <button onClick={onDismiss} className="p-2 text-[15px] font-bold text-[#1E293B] underline">
          I&apos;ll do this later
        </button>
      </div>
    </div>
  );
}

export function LocationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0284C7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-11 w-11"
    >
      <path d="M12,21.5 C12,21.5 19,15.2 19,10 C19,6.134 15.866,3 12,3 C8.134,3 5,6.134 5,10 C5,15.2 12,21.5 12,21.5 Z" />
      <path d="M12,10m-3,0a3,3 0 1,0 6,0a3,3 0 1,0 -6,0" />
    </svg>
  );
}

export function NotificationIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0284C7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-11 w-11"
    >
      <path d="M18,8 A6,6 0 0,0 6,8 C6,15 3,17 3,17 L21,17 C21,17 18,15 18,8 Z" />
      <path d="M13.73,21 A2,2 0 0,1 10.27,21" />
    </svg>
  );
}
