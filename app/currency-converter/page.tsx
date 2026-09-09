import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { CurrencyConverter } from "@/components/CurrencyConverter";

export default async function CurrencyConverterPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-5 p-6">
      <h1 className="text-2xl font-bold">Currency converter</h1>
      <CurrencyConverter />
    </div>
  );
}
