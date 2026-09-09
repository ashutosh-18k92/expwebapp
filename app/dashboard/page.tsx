import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/NotificationBell";
import { DeviceTokenSync } from "@/components/DeviceTokenSync";
import { TopicSync } from "@/components/TopicSync";

// Defensive default for a user doc predating notificationTopics.
const DEFAULT_NOTIFICATION_TOPICS = { essentials: true, promotions: false, feeds: false };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <DeviceTokenSync />
      <TopicSync notificationTopics={user.notificationTopics ?? DEFAULT_NOTIFICATION_TOPICS} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">You&apos;re signed in</h1>
        <NotificationBell />
      </div>
      <p className="text-slate-700">Signed in as {user.email}.</p>
      <p className="text-sm text-slate-500">
        Biometric sign-in: {user.biometricEnabled ? "enabled" : "not enabled"}.
      </p>
      <Link href="/journeys" className="text-sm font-semibold text-sky-700 underline">
        Manage your journeys
      </Link>
      <LogoutButton />
    </div>
  );
}
