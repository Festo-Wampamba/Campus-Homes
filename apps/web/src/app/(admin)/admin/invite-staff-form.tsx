"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATCHMENTS, STAFF_ROLE_KEYS, type StaffRoleKey } from "@campushomes/shared";

import { api, ApiError, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneField } from "@/components/phone-field";

const ROLE_LABELS: Record<StaffRoleKey, string> = {
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  ops_lead: "Ops Lead",
  ops_inspector: "Ops Inspector",
  finance_admin: "Finance Admin",
  support_admin: "Support Admin",
  auditor: "Auditor",
};

const selectClassName =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";

export type EditableInvitation = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roleKey: string;
  scopeType: string;
  scopeId: string | null;
  reason: string;
};

/** Creates an invitation, or edits a pending/expired one when `invitation` is given. */
export function InviteStaffForm({ invitation }: { invitation?: EditableInvitation }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(invitation?.name ?? "");
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [phone, setPhone] = useState(invitation?.phone ?? "");
  const [roleKey, setRoleKey] = useState<StaffRoleKey>((invitation?.roleKey as StaffRoleKey) ?? "ops_inspector");
  const [scopeType, setScopeType] = useState<"platform_wide" | "catchment">(
    invitation?.scopeType === "catchment" ? "catchment" : "platform_wide",
  );
  const [scopeId, setScopeId] = useState<(typeof CATCHMENTS)[number]>(
    (invitation?.scopeId as (typeof CATCHMENTS)[number]) ?? "MUK",
  );
  const [reason, setReason] = useState(invitation?.reason ?? "");
  // Each table row mounts its own edit dialog; ids must stay unique per page.
  const idPrefix = invitation ? `invite-${invitation.id}` : "invite";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api(invitation ? `/admin/staff/invitations/${invitation.id}` : "/admin/staff/invite", {
        method: invitation ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          email: email.trim(),
          phone: phone || undefined,
          roleKey,
          scopeType,
          ...(scopeType === "catchment" ? { scopeId } : {}),
          reason,
        }),
      });
      setOpen(false);
      if (!invitation) {
        setName("");
        setEmail("");
        setPhone("");
        setReason("");
      }
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to grant this role at this scope."
          : apiErrorMessage(err, invitation ? "Saving the invitation failed." : "Invite failed — check the details and try again."),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {invitation ? (
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 font-semibold hover:bg-muted"
          onClick={() => setOpen(true)}
        >
          Edit
        </button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}>
          <UserPlus aria-hidden className="size-4" />
          Invite staff
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen} dismissible={false}>
        <DialogHeader
          title={invitation ? "Edit invitation" : "Invite staff"}
          description={invitation
            ? "Saving renews the 24-hour window. Changing the email sends a fresh link and the old one stops working."
            : "Sends a one-time email invitation that expires after 24 hours. Staff complete authenticator verification to access their workspace."}
          onClose={() => setOpen(false)}
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-name`} required>Full name</Label>
              <Input
                id={`${idPrefix}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-email`} required>Email</Label>
                <Input
                  id={`${idPrefix}-email`}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <PhoneField
                id={`${idPrefix}-phone`}
                label="Phone (optional)"
                value={phone}
                onChange={setPhone}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-role`}>Role</Label>
                <select
                  id={`${idPrefix}-role`}
                  className={selectClassName}
                  value={roleKey}
                  onChange={(e) => setRoleKey(e.target.value as StaffRoleKey)}
                >
                  {STAFF_ROLE_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {ROLE_LABELS[key]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-scope`}>Scope</Label>
                <select
                  id={`${idPrefix}-scope`}
                  className={selectClassName}
                  value={scopeType}
                  onChange={(e) => setScopeType(e.target.value as "platform_wide" | "catchment")}
                >
                  <option value="platform_wide">Platform-wide</option>
                  <option value="catchment">Catchment</option>
                </select>
              </div>
            </div>
            {scopeType === "catchment" && (
              <div className="space-y-1.5">
                <Label htmlFor={`${idPrefix}-catchment`}>Catchment</Label>
                <select
                  id={`${idPrefix}-catchment`}
                  className={selectClassName}
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value as (typeof CATCHMENTS)[number])}
                >
                  {CATCHMENTS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-reason`} required>Reason</Label>
              <Input
                id={`${idPrefix}-reason`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why this person needs this role"
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (invitation ? "Saving…" : "Inviting…") : invitation ? "Save changes" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
