import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { LogoutButton } from "@/components/LogoutButton";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">You&apos;re signed in</h1>
      <p className="text-slate-700">Signed in as {user.email}.</p>
      <p className="text-sm text-slate-500">
        Biometric sign-in: {user.biometricEnabled ? "enabled" : "not enabled"}.
      </p>
      <LogoutButton />
    </div>
  );
}
