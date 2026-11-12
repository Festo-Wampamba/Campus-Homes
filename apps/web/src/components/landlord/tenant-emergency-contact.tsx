"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateTenantEmergencySchema, type LandlordTenant } from "@campushomes/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";

const FIELD = "mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function TenantEmergencyContactButton({ tenant }: { tenant: LandlordTenant }) {
  const [open, setOpen] = useState(false);
  const missing = !tenant.emergencyContactName && !tenant.emergencyContactPhone;
  return <>
    <Button type="button" size="xs" variant="secondary" className="mt-1.5" onClick={() => setOpen(true)}>
      {missing ? "Add emergency contact" : "Edit emergency contact"}
    </Button>
    {open && <EmergencyContactDialog tenant={tenant} onClose={() => setOpen(false)} />}
  </>;
}

function EmergencyContactDialog({ tenant, onClose }: { tenant: LandlordTenant; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(tenant.emergencyContactName ?? "");
  const [phone, setPhone] = useState(tenant.emergencyContactPhone ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const parsed = updateTenantEmergencySchema.safeParse({ emergencyContactName: name.trim(), emergencyContactPhone: phone.trim() });
    if (!parsed.success) { setError("Enter a valid emergency phone number, or leave it blank."); return; }
    setPending(true);
    try {
      await api(`/reservations/${tenant.reservationId}/emergency-contact`, { method: "PATCH", body: JSON.stringify(parsed.data) });
      router.refresh(); onClose();
    } catch (caught) { setError(apiErrorMessage(caught, "Could not update the emergency contact. Try again.")); }
    finally { setPending(false); }
  }
  function close() { if (!pending) onClose(); }
  return <Dialog aria-label="Edit tenant emergency contact" open size="sm" dismissible={false} onOpenChange={(next) => { if (!next) close(); }}>
    <form className="contents" onSubmit={submit}>
      <DialogHeader title="Emergency contact" description={`${tenant.name ?? "Student"} · ${tenant.propertyName} · ${tenant.roomLabel}`} onClose={close} />
      <DialogBody className="space-y-4">
        <p className="text-sm text-muted-foreground">Add missing details or correct this booking’s emergency contact. These details do not change the student’s account profile.</p>
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <label className="block text-sm font-semibold">Emergency contact name<input autoComplete="off" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={FIELD} /></label>
          <label className="block text-sm font-semibold">Emergency contact phone<input autoComplete="off" type="tel" placeholder="0771 234567" value={phone} onChange={(event) => setPhone(event.target.value)} className={FIELD} /></label>
        </fieldset>
        <p className="text-xs text-muted-foreground">Both fields are optional. Clear a field to remove it from this booking.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogBody>
      <DialogFooter><Button type="button" variant="secondary" disabled={pending} onClick={close}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save emergency contact"}</Button></DialogFooter>
    </form>
  </Dialog>;
}
