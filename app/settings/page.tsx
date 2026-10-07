import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isNativeClient } from "@/lib/platform";
import { getBuildVersion } from "@/lib/build-version";
import { getDb, getNotificationTopicsCatalog } from "@/lib/db";
import { defaultSubscribedTopicIds } from "@/lib/notification-topics-catalog";
import { SettingsToggles } from "@/components/SettingsToggles";

// Defensive default for a user doc predating quietHours - off, with a
// sensible overnight window pre-filled for whenever it's turned on.
const DEFAULT_QUIET_HOURS = { enabled: false, startTime: "22:00", endTime: "07:00" };

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const isNativeInitial = await isNativeClient();
  const { appVersion, builtAt } = getBuildVersion();
  const db = await getDb();
  const topicsCatalog = await getNotificationTopicsCatalog(db);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsToggles
        topicsCatalog={topicsCatalog}
        subscribedTopicsInitial={user.preferences?.subscribedTopics ?? defaultSubscribedTopicIds(topicsCatalog)}
        quietHoursInitial={user.preferences?.quietHours ?? DEFAULT_QUIET_HOURS}
        isNativeInitial={isNativeInitial}
      />
      <p className="text-center text-xs text-slate-400">
        Version {appVersion} · Built {builtAt}
      </p>
    </div>
  );
}
