"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";

import type { PendingLandlordAccount } from "@campushomes/shared";

import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Reachable from both /ops/landlord-accounts and /admin/landlord-accounts —
// PermissionsGuard (landlords.review_kyc / landlords.suspend) is the real
// gate, same dual-mount pattern as InquiriesManager.
export function LandlordAccountsManager({ initialAccounts }: { initialAccounts: PendingLandlordAccount[] }) {
  const [rows, setRows] = useState(initialAccounts);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function approve(userId: string) {
    setPendingId(userId);
    setError(null);
    try {
      await api(`/admin/landlord-accounts/${userId}/approve`, { method: "POST" });
      setRows((current) => current.filter((r) => r.userId !== userId));
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't approve this account — try again."));
    } finally {
      setPendingId(null);
    }
  }

  async function reject(userId: string) {
    if (!reason.trim()) return;
    setPendingId(userId);
    setError(null);
    try {
      await api(`/admin/landlord-accounts/${userId}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setRows((current) => current.filter((r) => r.userId !== userId));
      setRejectingId(null);
      setReason("");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't reject this account — try again."));
    } finally {
      setPendingId(null);
    }
  }

  if (rows.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">No landlord accounts awaiting approval.</p>;
  }

  return (
    <div className="mt-6 space-y-3">
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      {rows.map((row) => (
        <Card key={row.userId}>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <p className="font-display text-sm font-semibold text-foreground">{row.name || "Unnamed"}</p>
              <p className="text-sm text-muted-foreground">
                {row.phone ?? "no phone"} · registered {formatDate(row.createdAt)}
              </p>
            </div>
            {rejectingId === row.userId ? (
              <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-nowrap">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for rejecting"
                  className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pendingId === row.userId || !reason.trim()}
                  onClick={() => reject(row.userId)}
                >
                  Confirm reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRejectingId(null);
                    setReason("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={pendingId === row.userId}
                  onClick={() => setRejectingId(row.userId)}
                >
                  <X aria-hidden className="size-4" />
                  Reject
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pendingId === row.userId}
                  onClick={() => approve(row.userId)}
                >
                  <Check aria-hidden className="size-4" />
                  {pendingId === row.userId ? "Approving…" : "Approve"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
