"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { tenancyClaimIssuedSchema, type LandlordTenant, type TenancyClaimIssued } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";

const PORTAL_LABEL: Record<LandlordTenant["portalStatus"], string> = {
  private: "Portal not activated",
  invited: "Portal code issued",
  active: "Portal active",
};

/** Portal state for one tenant, with the invite action for a private record. */
export function TenantPortalStatus({ tenant }: { tenant: LandlordTenant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">
        {PORTAL_LABEL[tenant.portalStatus]}
      </span>
      {tenant.portalStatus !== "active" && (
        <div className="w-full">
          <Button type="button" size="xs" variant="secondary" className="mt-1" onClick={() => setOpen(true)}>
            {tenant.portalStatus === "invited" ? "New portal code" : "Invite to portal"}
          </Button>
        </div>
      )}
      {open && <PortalInviteDialog tenant={tenant} onClose={() => setOpen(false)} />}
    </>
  );
}

function PortalInviteDialog({ tenant, onClose }: { tenant: LandlordTenant; onClose: () => void }) {
  const router = useRouter();
  const [issued, setIssued] = useState<TenancyClaimIssued | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const link = issued ? `${window.location.origin}/activate?code=${issued.code}` : "";

  async function call(path: string, onDone: (body: unknown) => void, fallback: string) {
    setError(null);
    setPending(true);
    try {
      onDone(await api(path, { method: "POST", body: JSON.stringify({ reservationId: tenant.reservationId }) }));
      router.refresh();
    } catch (caught) {
      setError(apiErrorMessage(caught, fallback));
    } finally {
      setPending(false);
    }
  }
  const issue = () => call("/tenant-portal/invites", (body) => setIssued(tenancyClaimIssuedSchema.parse(body)), "Could not create a portal code. Try again.");
  const revoke = () => call("/tenant-portal/invites/revoke", onClose, "Could not cancel the portal code. Try again.");

  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? issued!.code : link);
      setCopied(what);
    } catch {
      setError("Copying isn't available in this browser. Select the text and copy it.");
    }
  }
  function close() { if (!pending) onClose(); }

  return (
    <Dialog aria-label="Invite tenant to the student portal" open size="sm" dismissible={false} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogHeader title="Invite to the student portal" description={`${tenant.name ?? "Tenant"} · ${tenant.propertyName} · ${tenant.roomLabel}`} onClose={close} />
      <DialogBody className="space-y-4">
        {issued ? (
          <>
            <p className="text-sm text-muted-foreground">
              Give this code to {tenant.name ?? "the tenant"} only. Whoever enters it gets this booking, its receipts and its balance in their own portal.
            </p>
            <div className="rounded-lg border border-border bg-muted/40 p-4 text-center">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Portal code</p>
              <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-foreground select-all">{issued.code}</p>
              <p className="mt-2 text-xs text-muted-foreground">Works once. Expires {issued.expiresAt.toLocaleString()}.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => copy("code")}>{copied === "code" ? "Code copied" : "Copy code"}</Button>
              <Button type="button" variant="secondary" onClick={() => copy("link")}>{copied === "link" ? "Link copied" : "Copy activation link"}</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The tenant opens the link (or scans the property QR and picks &ldquo;I already live here&rdquo;), signs in or creates a student account, and enters the code. This code is not shown again; create a new one if it is lost.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Create a single-use code that links this tenant record to the tenant&apos;s own student account. Their booking, payments and move-in status stay exactly as recorded.
            {tenant.portalStatus === "invited" && " The code issued earlier stops working when you create a new one."}
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogBody>
      <DialogFooter>
        {!issued && tenant.portalStatus === "invited" && (
          <Button type="button" variant="secondary" disabled={pending} onClick={revoke}>Cancel issued code</Button>
        )}
        <Button type="button" variant="secondary" disabled={pending} onClick={close}>{issued ? "Done" : "Close"}</Button>
        {!issued && <Button type="button" disabled={pending} onClick={issue}>{pending ? "Creating…" : "Create portal code"}</Button>}
      </DialogFooter>
    </Dialog>
  );
}
