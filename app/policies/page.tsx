import { redirect } from "next/navigation";
import { ShieldOff, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb, type PolicyDoc } from "@/lib/db";
import { isNativeClient } from "@/lib/platform";
import { PolicyDownloadButton } from "@/components/PolicyDownloadButton";

export default async function PoliciesPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const db = await getDb();
  const policies = await db
    .collection<PolicyDoc>("policies")
    .find({ userId: user._id })
    .sort({ active: -1, createdAt: -1 })
    .toArray();
  const isNative = await isNativeClient();

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">My policies</h1>

      {/*
        Customer-facing copy - DRAFT, needs Compliance sign-off before ship
        per FOGIL's FCA authorisation.
      */}
      {isNative && policies.length > 0 && (
        <p className="text-xs text-slate-500">
          Tap Save for offline use on a document to keep it available on this device without a
          connection - see it again from My policies on the offline home screen.
        </p>
      )}

      {policies.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-6 text-center">
          <ShieldOff className="h-8 w-8 text-slate-400" />
          {/*
            Customer-facing copy - DRAFT, needs Compliance sign-off before
            ship per FOGIL's FCA authorisation.
          */}
          <p className="text-sm text-slate-500">
            You are not currently covered under any policy with us.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {policies.map((policy) => (
          <li key={policy._id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-[#BAE6FD] bg-[#E0F2FE]">
                  <FileText className="h-5 w-5 text-[#0284C7]" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900">{policy.displayName}</p>
                  {policy.policyNumber && (
                    <p className="text-xs text-slate-500">Policy number: {policy.policyNumber}</p>
                  )}
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  policy.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {policy.active ? "Active" : "Inactive"}
              </span>
            </div>

            {(policy.coverType || policy.startDate || policy.endDate) && (
              <p className="text-xs text-slate-500">
                {[
                  policy.coverType,
                  policy.startDate &&
                    `from ${new Date(policy.startDate).toLocaleDateString("en-GB")}`,
                  policy.endDate && `to ${new Date(policy.endDate).toLocaleDateString("en-GB")}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}

            <PolicyDownloadButton
              userId={policy.userId}
              fileName={policy.fileName}
              displayName={policy.displayName}
              active={policy.active}
              policyNumber={policy.policyNumber}
              coverType={policy.coverType}
              startDate={policy.startDate?.toISOString()}
              endDate={policy.endDate?.toISOString()}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
