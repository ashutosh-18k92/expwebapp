import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { SettingsToggles } from "@/components/SettingsToggles";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <SettingsToggles biometricEnabledInitial={user.biometricEnabled} />
    </div>
  );
}
