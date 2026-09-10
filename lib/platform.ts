import { cookies } from "next/headers";
import { FOG_NATIVE_CLIENT_COOKIE } from "@/lib/native-client";

/** Server-side read of the native-shell signal proxy.ts persists from FOG_NATIVE_HEADER. */
export async function isNativeClient(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(FOG_NATIVE_CLIENT_COOKIE)?.value);
}
