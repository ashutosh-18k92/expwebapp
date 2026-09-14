import { redirect } from "next/navigation";
import { Settings, User, ArrowLeftRight, Plane } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { NotificationBell } from "@/components/NotificationBell";
import { DeviceTokenSync } from "@/components/DeviceTokenSync";
import { TopicSync } from "@/components/TopicSync";
import { TimeZoneSync } from "@/components/TimeZoneSync";
import { SettingsSync } from "@/components/SettingsSync";
import { DashboardCard } from "@/components/DashboardCard";

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
      <TimeZoneSync />
      <SettingsSync />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <NotificationBell />
      </div>

      <div className="flex flex-col gap-3">
        <DashboardCard
          href="/settings"
          icon={<Settings className="h-5 w-5 text-[#0284C7]" />}
          title="Settings"
          description="Notifications, biometrics and more."
        />
        <DashboardCard
          href="/account"
          icon={<User className="h-5 w-5 text-[#0284C7]" />}
          title="User account"
          description={user.email}
        />
        <DashboardCard
          href="/currency-converter"
          icon={<ArrowLeftRight className="h-5 w-5 text-[#0284C7]" />}
          title="Currency converter"
          description="Convert GBP to your local currency."
        />
        <DashboardCard
          href="/journeys"
          icon={<Plane className="h-5 w-5 text-[#0284C7]" />}
          title="Manage journeys"
          description="Schedule and view your upcoming trips."
        />
      </div>
    </div>
  );
}
