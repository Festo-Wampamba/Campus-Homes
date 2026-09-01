import { AuthCallbackClient } from "./auth-callback-client";

// This page's whole job is to read the just-set session cookie and route
// off it — caching its HTML (Next was serving it `x-nextjs-cache: HIT` with
// s-maxage=1yr) freezes every visitor onto whatever the first-ever render
// happened to hydrate as, causing exactly the intermittent stuck/blank
// behavior QA hit on staff sign-in.
export const dynamic = "force-dynamic";

export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
