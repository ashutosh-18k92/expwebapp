import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { JourneyForm } from "@/components/JourneyForm";

export default async function JourneysPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <Link href="/dashboard" className="text-sm font-semibold text-slate-500 underline">
        Back to dashboard
      </Link>
      <h1 className="text-2xl font-bold">Your journeys</h1>
      {/*
        Customer-facing copy - DRAFT, needs Compliance sign-off before ship
        per FOGIL's FCA authorisation.
      */}
      <p className="text-sm text-slate-500">
        We&apos;ll send you a reminder 14 days before a scheduled journey starts.
      </p>
      <JourneyForm />
    </div>
  );
}
