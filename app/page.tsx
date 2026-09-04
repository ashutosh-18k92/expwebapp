import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { HomeDemo } from "@/components/HomeDemo";

function AccountIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0284C7"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12,12m-4,0a4,4 0 1,0 8,0a4,4 0 1,0 -8,0" />
      <path d="M4,20c0,-4.4 3.6,-8 8,-8s8,3.6 8,8" />
    </svg>
  );
}

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <div>
      <main className="flex flex-col gap-5">
        {user ? (
          <Link href="/dashboard" className="flex w-fit items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#BAE6FD] bg-[#E0F2FE]">
              <AccountIcon />
            </span>
            <span className="text-sm font-medium">{user.email}</span>
          </Link>
        ) : (
          <div className="flex gap-3">
            <Link
              href="/register"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Register
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Sign in
            </Link>
          </div>
        )}

        <p>
          A placehoilder project for the fog-experience-web to test the synchronisation between the
          native envirionment and webapp.
        </p>

        <HomeDemo />
      </main>
    </div>
  );
}
