"use client";

import { useEffect, useState } from "react";

import { appCallbackUrl, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function GoogleAccountLink() {
  const [linked, setLinked] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void authClient.listAccounts().then(({ data }) => {
      setLinked(Boolean(data?.some((account) => account.providerId === "google")));
    });
  }, []);

  async function linkGoogle() {
    setPending(true);
    setMessage(null);
    const { error } = await authClient.linkSocial({ provider: "google", callbackURL: appCallbackUrl("/profile?google=linked") });
    setPending(false);
    if (error) setMessage(error.message ?? "Google could not be linked to this account.");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-4">
      <div>
        <p className="text-sm font-bold">Google account</p>
        <p className="mt-1 text-xs text-muted-foreground">{linked ? "Linked for faster student sign-in." : "Link your verified Google account for faster sign-in."}</p>
        {message && <p role="alert" className="mt-2 text-xs text-destructive">{message}</p>}
      </div>
      {!linked && <Button type="button" variant="secondary" disabled={pending} onClick={linkGoogle}>{pending ? "Connecting…" : "Link Google"}</Button>}
    </div>
  );
}
