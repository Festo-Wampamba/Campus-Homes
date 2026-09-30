import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "node:crypto";

import { contentSecurityPolicy } from "./lib/content-security-policy";

// Supply the actual requested path to server layout guards, including deep
// links. Always overwrite incoming values; this is not client-owned context.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  const nonce = randomBytes(16).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");
  // Never accept an attacker-supplied nonce or policy. Next uses the request
  // CSP to nonce its own bootstrap scripts during dynamic rendering.
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  requestHeaders.set("x-campushomes-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // Runtime check (one image is promoted across environments). Fail-safe:
  // noindex unless this environment opts in, same rule as app/robots.ts.
  if (process.env.ALLOW_INDEXING !== "true") response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon.ico|images/).*)"],
};
