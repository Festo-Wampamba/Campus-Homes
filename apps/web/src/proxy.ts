import { NextResponse, type NextRequest } from "next/server";

// Supply the actual requested path to server layout guards, including deep
// links. Always overwrite incoming values; this is not client-owned context.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-campushomes-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|images/).*)"],
};
