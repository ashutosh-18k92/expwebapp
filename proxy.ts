import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { FOG_NATIVE_CLIENT_COOKIE, FOG_NATIVE_HEADER } from "@/lib/native-client";

export function proxy(request: NextRequest) {
  const nativeHeader = request.headers.get(FOG_NATIVE_HEADER);
  if (!nativeHeader) return NextResponse.next();

  const response = NextResponse.next();
  response.cookies.set(FOG_NATIVE_CLIENT_COOKIE, nativeHeader, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // Only re-established on a native cold launch (no per-request refresh is
    // possible) - keep it long-lived so it survives until the app is next
    // force-quit and relaunched.
    maxAge: 60 * 60 * 24 * 400,
    path: "/",
  });
  return response;
}

export const config = {
  // The native header never reaches API routes anyway (only the document
  // navigation carries it) - no need to run this on /api/*.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
