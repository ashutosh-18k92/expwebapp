import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { isNativeClient } from "@/lib/platform";
import { LogoutButton } from "@/components/LogoutButton";
import { PrepareForRemovalButton } from "@/components/PrepareForRemovalButton";
import { ProfileForm } from "@/components/ProfileForm";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  const isNativeInitial = await isNativeClient();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">User account</h1>
      <p className="text-slate-700">Signed in as {user.email}.</p>
      <ProfileForm
        firstNameInitial={user.firstName ?? ""}
        dateOfBirthInitial={user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : ""}
      />
      <LogoutButton />
      <PrepareForRemovalButton isNativeInitial={isNativeInitial} />
    </div>
  );
}
