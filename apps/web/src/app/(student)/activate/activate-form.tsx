"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { redeemTenancyClaimSchema } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { api, apiErrorMessage } from "@/lib/api";

export function ActivateForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = redeemTenancyClaimSchema.safeParse({ code });
    if (!parsed.success) {
      setError("Enter the 10-character code your landlord gave you.");
      return;
    }
    setPending(true);
    try {
      await api("/tenant-portal/claims", { method: "POST", body: JSON.stringify(parsed.data) });
      router.replace("/reservations");
      router.refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught, "Could not link your booking. Try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div>
        <label htmlFor="portal-code" className="block text-sm font-semibold text-foreground">Portal code</label>
        <input
          id="portal-code"
          name="code"
          required
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          placeholder="XXXXX-XXXXX"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "portal-code-error" : "portal-code-hint"}
          className="mt-1 min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-base tracking-widest uppercase focus-visible:outline-2 focus-visible:outline-ring"
        />
        <p id="portal-code-hint" className="mt-1 text-xs text-muted-foreground">Your landlord or hostel custodian gives you this code. It works once.</p>
        {error && <p id="portal-code-error" role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
      <Button type="submit" disabled={pending}>{pending ? "Linking…" : "Link my booking"}</Button>
    </form>
  );
}
