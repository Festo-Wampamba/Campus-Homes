"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { homeForAuthenticatedRole } from "@/lib/auth-routing";

// Relative, not absolute — see lib/api.ts's BASE for why.
const BASE = "";

function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Same open-redirect guard as /profile?next= and /sign-in?next= — only
    // ever send the browser back within the app.
    const rawNext = searchParams.get("next");
    const next = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
    void fetch(`${BASE}/api/auth/session`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { role?: string; status?: string } } | null) => {
        if (cancelled) return;
        if (!data?.user) {
          setError("We could not verify your new session.");
          return;
        }
        // The API's own sign-in doesn't gate on our custom `status` column —
        // a pending (self-registered, unapproved) or suspended account
        // still gets a session here. Route them to a page that explains
        // that instead of their normal portal, `next` included.
        if (data.user.status && data.user.status !== "active") {
          router.replace("/account-pending");
          router.refresh();
          return;
        }
        try {
          const home = homeForAuthenticatedRole(data.user.role);
          router.replace(next ?? home);
          router.refresh();
        } catch (routeError) {
          setError(routeError instanceof Error ? routeError.message : "Your account role could not be verified.");
        }
      })
      .catch(() => {
        if (!cancelled) setError("We could not verify your new session.");
      });
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <main className="grid min-h-dvh place-items-center bg-teal-900 px-4 text-center text-white">
      <div className="max-w-sm">
        <p className="font-brand text-2xl">CampusHomes</p>
        {error ? (
          <>
            <p className="mt-4 text-sm text-white/70">{error}</p>
            <a href="/sign-in" className="mt-6 inline-flex rounded-lg bg-coral-500 px-4 py-2 text-sm font-bold text-teal-900">Return to sign in</a>
          </>
        ) : (
          <p className="mt-4 text-sm text-white/70">Finishing your secure sign-in…</p>
        )}
      </div>
    </main>
  );
}

export function AuthCallbackClient() {
  return (
    <Suspense
      fallback={
        <main className="grid min-h-dvh place-items-center bg-teal-900 text-sm text-white">
          Finishing your secure sign-in…
        </main>
      }
    >
      <AuthCallback />
    </Suspense>
  );
}
