import { NextResponse, type NextRequest } from "next/server";

// Supply the actual requested path to server layout guards, including deep
// links. Always overwrite incoming values; this is not client-owned context.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-campushomes-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // Runtime check (one image is promoted across environments). Fail-safe:
  // noindex unless this environment opts in, same rule as app/robots.ts.
  if (process.env.ALLOW_INDEXING !== "true") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|images/).*)"],
};
