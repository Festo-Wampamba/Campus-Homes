"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, apiErrorMessage } from "@/lib/api";

type Invitation = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleKey: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  expiresAt: string;
  deliveredAt: string | null;
  deliveryAttempts: number;
  lastDeliveryError: string | null;
};

export function StaffInvitations({ rows }: { rows: Invitation[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function mutate(id: string, action: "retry" | "cancel") {
    setBusy(id);
    setNotice(null);
    try {
      await api(`/admin/staff/invitations/${id}${action === "retry" ? "/retry" : ""}`, {
        method: action === "retry" ? "POST" : "DELETE",
      });
      setNotice(action === "retry" ? "Invitation delivery retried." : "Invitation cancelled.");
      router.refresh();
    } catch (error) {
      setNotice(apiErrorMessage(error, "The invitation could not be updated."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-xs">
        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
          <tr>{["Invitee", "Role and scope", "Delivery", "Expires", "Status", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-bold uppercase tracking-wide">{label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3"><strong className="block">{row.name}</strong><span className="text-muted-foreground">{row.email ?? row.phone}</span></td>
              <td className="px-4 py-3"><span className="block font-semibold">{row.roleKey.replaceAll("_", " ")}</span><span className="text-muted-foreground">{row.scopeType.replaceAll("_", " ")}{row.scopeId ? ` · ${row.scopeId}` : ""}</span></td>
              <td className="px-4 py-3"><span className="block">{row.deliveredAt ? "Delivered" : row.lastDeliveryError ? "Failed" : "Pending"}</span><span className="text-muted-foreground">{row.deliveryAttempts} attempt{row.deliveryAttempts === 1 ? "" : "s"}</span></td>
              <td className="px-4 py-3">{new Date(row.expiresAt).toLocaleString()}</td>
              <td className="px-4 py-3 capitalize">{row.status}</td>
              <td className="px-4 py-3">
                {row.status === "pending" && <div className="flex gap-2">
                  <button disabled={busy === row.id} className="rounded-md border border-border px-3 py-2 font-semibold hover:bg-muted disabled:opacity-50" onClick={() => mutate(row.id, "retry")}>Retry</button>
                  <button disabled={busy === row.id} className="rounded-md border border-destructive/30 px-3 py-2 font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-50" onClick={() => mutate(row.id, "cancel")}>Cancel</button>
                </div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <p className="py-10 text-center text-sm text-muted-foreground">No staff invitations yet.</p>}
      {notice && <p role="status" className="border-t border-border px-4 py-3 text-sm">{notice}</p>}
    </div>
  );
}
