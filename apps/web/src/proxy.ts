import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: the API verifies the session on every call
export function proxy(request: NextRequest) {
  const signedIn = request.cookies.has("myos_session");
  const devFallback = process.env.NODE_ENV !== "production";
  if (signedIn || devFallback) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico).*)"],
};
