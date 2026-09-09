import Link from "next/link";
import { User, Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { BiometricGate } from "@/components/BiometricGate";

function AccountIcon() {
  return <User color="#0284C7" strokeWidth={2} className="h-5 w-5" />;
}

function SettingsIcon() {
  return <Settings color="currentColor" strokeWidth={2} className="h-5 w-5" />;
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
        </main>
      </div>
    </BiometricGate>
  );
}
