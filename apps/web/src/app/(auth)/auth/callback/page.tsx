"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { homeForAuthenticatedRole } from "@/lib/auth-routing";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void authClient.getSession().then(({ data, error: sessionError }) => {
      if (cancelled) return;
      if (sessionError || !data?.user) {
        setError(sessionError?.message ?? "We could not verify your new session.");
        return;
      }
      try {
        router.replace(homeForAuthenticatedRole((data.user as { role?: string }).role));
        router.refresh();
      } catch (routeError) {
        setError(routeError instanceof Error ? routeError.message : "Your account role could not be verified.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

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
