import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { FOG_NATIVE_CLIENT_COOKIE, FOG_NATIVE_HEADER } from "@/lib/native-client";
import { SESSION_COOKIE, renewNativeSessionIfStale } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const nativeHeader = request.headers.get(FOG_NATIVE_HEADER);
  const isNativeClient = Boolean(nativeHeader) || Boolean(request.cookies.get(FOG_NATIVE_CLIENT_COOKIE)?.value);
  if (!isNativeClient) return NextResponse.next();

  const response = NextResponse.next();

  if (nativeHeader) {
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
  }

  // Sliding-window session renewal (native only, independent of
  // biometricEnabled): an actively-returning native user's session keeps
  // resetting to a fresh 90 days instead of hard-expiring 90 days after the
  // original login. Browser requests never reach here - isNativeClient is
  // false for them, so no added Mongo calls.
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    const renewedTtlSeconds = await renewNativeSessionIfStale(sessionToken);
    if (renewedTtlSeconds) {
      response.cookies.set(SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: renewedTtlSeconds,
      });
    }
  }

  return response;
}

export const config = {
  // The native header never reaches API routes anyway (only the document
  // navigation carries it) - no need to run this on /api/*.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
