"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, apiErrorMessage } from "@/lib/api";
import { InviteStaffForm } from "../../invite-staff-form";

type Invitation = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleKey: string;
  scopeType: string;
  scopeId: string | null;
  reason: string;
  status: string;
  expiresAt: string;
  deliveredAt: string | null;
  deliveryAttempts: number;
  lastDeliveryError: string | null;
};

type Action = "retry" | "cancel" | "delete";

const REQUESTS: Record<Action, { path: string; method: string; done: string }> = {
  retry: { path: "/retry", method: "POST", done: "Invitation sent again — the link is valid for 24 hours." },
  cancel: { path: "", method: "DELETE", done: "Invitation cancelled." },
  delete: { path: "/permanent", method: "DELETE", done: "Invitation deleted." },
};

export function StaffInvitations({ rows }: { rows: Invitation[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Snapshot once per mount: expiry is a display hint, the API enforces it.
  const [now] = useState(() => Date.now());

  async function mutate(row: Invitation, action: Action) {
    if (action === "delete" && !window.confirm(`Delete the invitation for ${row.name}? This removes it from the list.`)) return;
    setBusy(row.id);
    setNotice(null);
    try {
      const request = REQUESTS[action];
      await api(`/admin/staff/invitations/${row.id}${request.path}`, { method: request.method });
      setNotice(request.done);
      router.refresh();
    } catch (error) {
      setNotice(apiErrorMessage(error, "The invitation could not be updated."));
    } finally {
      setBusy(null);
    }
  }

  const button = "rounded-md border border-border px-3 py-2 font-semibold hover:bg-muted disabled:opacity-50";
  const danger = "rounded-md border border-destructive/30 px-3 py-2 font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>{["Invitee", "Role and scope", "Delivery", "Expires", "Status", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-bold uppercase tracking-wide">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const expired = row.status === "pending" && Date.parse(row.expiresAt) <= now;
            const live = row.status === "pending" && !expired;
            return (
              <tr key={row.id}>
                <td className="px-4 py-3"><strong className="block">{row.name}</strong><span className="text-muted-foreground">{row.email ?? row.phone}</span></td>
                <td className="px-4 py-3"><span className="block font-semibold">{row.roleKey.replaceAll("_", " ")}</span><span className="text-muted-foreground">{row.scopeType.replaceAll("_", " ")}{row.scopeId ? ` · ${row.scopeId}` : ""}</span></td>
                <td className="px-4 py-3"><span className="block">{row.deliveredAt ? "Delivered" : row.lastDeliveryError ? "Failed" : "Pending"}</span><span className="text-muted-foreground">{row.deliveryAttempts} attempt{row.deliveryAttempts === 1 ? "" : "s"}</span></td>
                <td className="px-4 py-3">{new Date(row.expiresAt).toLocaleString()}</td>
                <td className={expired ? "px-4 py-3 font-semibold text-amber-700" : "px-4 py-3 capitalize"}>{expired ? "Expired" : row.status}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {row.status === "pending" && <InviteStaffForm invitation={row} />}
                    {live && <button disabled={busy === row.id} className={button} onClick={() => mutate(row, "retry")}>Resend</button>}
                    {live && <button disabled={busy === row.id} className={danger} onClick={() => mutate(row, "cancel")}>Cancel</button>}
                    {expired && <button disabled={busy === row.id} className={button} onClick={() => mutate(row, "retry")}>Re-invite</button>}
                    {(expired || row.status === "cancelled") && <button disabled={busy === row.id} className={danger} onClick={() => mutate(row, "delete")}>Delete</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">No staff invitations yet.</p>}
      {notice && <p role="status" className="border-t border-border px-4 py-3 text-sm">{notice}</p>}
    </div>
  );
}
