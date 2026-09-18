import Link from "next/link";
import { User, Settings } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { isNativeClient } from "@/lib/platform";
import { BiometricGate } from "@/components/BiometricGate";
import DashboardPage from "./dashboard/page";

function AccountIcon() {
  return (
    <User
      color="#0284C7"
      strokeWidth={2}
      className="h-5 w-5"
    />
  );
}

function SettingsIcon() {
  return (
    <Settings
      color="currentColor"
      strokeWidth={2}
      className="h-5 w-5"
    />
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const isNativeInitial = await isNativeClient();

  return (
    <BiometricGate isNativeInitial={isNativeInitial}>
      <div>
        <main className="flex flex-col gap-5">
          {user ? (
            <DashboardPage />
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
        </main>
      </div>
    </BiometricGate>
  );
}
