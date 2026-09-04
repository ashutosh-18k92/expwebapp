import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { BiometricGate } from "@/components/BiometricGate";
import { CurrencyConverter } from "@/components/CurrencyConverter";

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0284C7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12,12m-4,0a4,4 0 1,0 8,0a4,4 0 1,0 -8,0" />
      <path d="M4,20c0,-4.4 3.6,-8 8,-8s8,3.6 8,8" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12,12m-3,0a3,3 0 1,0 6,0a3,3 0 1,0 -6,0" />
      <path d="M19.4,15a1.65,1.65 0 0,0 0.33,1.82l0.06,0.06a2,2 0 1,1 -2.83,2.83l-0.06,-0.06a1.65,1.65 0 0,0 -1.82,-0.33a1.65,1.65 0 0,0 -1,1.51V21a2,2 0 1,1 -4,0v-0.09A1.65,1.65 0 0,0 9,19.4a1.65,1.65 0 0,0 -1.82,0.33l-0.06,0.06a2,2 0 1,1 -2.83,-2.83l0.06,-0.06a1.65,1.65 0 0,0 0.33,-1.82a1.65,1.65 0 0,0 -1.51,-1H3a2,2 0 1,1 0,-4h0.09A1.65,1.65 0 0,0 4.6,9a1.65,1.65 0 0,0 -0.33,-1.82l-0.06,-0.06a2,2 0 1,1 2.83,-2.83l0.06,0.06a1.65,1.65 0 0,0 1.82,0.33H9a1.65,1.65 0 0,0 1,-1.51V3a2,2 0 1,1 4,0v0.09a1.65,1.65 0 0,0 1,1.51a1.65,1.65 0 0,0 1.82,-0.33l0.06,-0.06a2,2 0 1,1 2.83,2.83l-0.06,0.06a1.65,1.65 0 0,0 -0.33,1.82V9a1.65,1.65 0 0,0 1.51,1H21a2,2 0 1,1 0,4h-0.09a1.65,1.65 0 0,0 -1.51,1z" />
    </svg>
  );
}

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <BiometricGate enabled={Boolean(user?.biometricEnabled)}>
      <div>
        <main className="flex flex-col gap-5">
          {user ? (
            <div className="flex items-center justify-between">
              <Link href="/dashboard" className="flex w-fit items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#BAE6FD] bg-[#E0F2FE]">
                  <AccountIcon />
                </span>
                <span className="text-sm font-medium">{user.email}</span>
              </Link>
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-700 text-slate-300 transition-colors hover:text-white"
              >
                <SettingsIcon />
              </Link>
            </div>
          ) : (
            <div className="flex gap-3">
              <Link
                href="/register"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Register
              </Link>
              <Link
                href="/login"
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Sign in
              </Link>
            </div>
          )}

          <p>
            A placehoilder project for the fog-experience-web to test the synchronisation between the
            native envirionment and webapp.
          </p>

          <CurrencyConverter />
        </main>
      </div>
    </BiometricGate>
  );
}
