import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isNativeClient } from "@/lib/platform";
import { SettingsToggles } from "@/components/SettingsToggles";

// Defensive default for a user doc predating notificationTopics.
const DEFAULT_NOTIFICATION_TOPICS = { essentials: true, promotions: false, feeds: false };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const isNativeInitial = await isNativeClient();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsToggles
        biometricEnabledInitial={user.biometricEnabled}
        notificationTopicsInitial={user.notificationTopics ?? DEFAULT_NOTIFICATION_TOPICS}
        isNativeInitial={isNativeInitial}
      />
    </div>
  );
}
