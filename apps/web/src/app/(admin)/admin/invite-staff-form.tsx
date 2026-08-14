"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CATCHMENTS, STAFF_ROLE_KEYS, type StaffRoleKey } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
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

export function InviteStaffForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleKey, setRoleKey] = useState<StaffRoleKey>("ops_inspector");
  const [scopeType, setScopeType] = useState<"platform_wide" | "catchment">("platform_wide");
  const [scopeId, setScopeId] = useState<(typeof CATCHMENTS)[number]>("MUK");
  const [reason, setReason] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/admin/staff/invite", {
        method: "POST",
        body: JSON.stringify({
          name,
          email: email || undefined,
          phone: phone || undefined,
          roleKey,
          scopeType,
          ...(scopeType === "catchment" ? { scopeId } : {}),
          reason,
        }),
      });
      setOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      setReason("");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to grant this role at this scope."
          : "Invite failed — check the details and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden className="size-4" />
        Invite staff
      </Button>

      <Dialog open={open} onOpenChange={setOpen} dismissible={false}>
        <DialogHeader
          title="Invite staff"
          description="Creates the account and grants the selected role. They can't sign in until credentials are provisioned."
          onClose={() => setOpen(false)}
        />
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name" required>Full name</Label>
              <Input
                id="invite-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">Email (optional)</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <PhoneField
                id="invite-phone"
                label="Phone (optional)"
                value={phone}
                onChange={setPhone}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <select
                  id="invite-role"
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
                <Label htmlFor="invite-scope">Scope</Label>
                <select
                  id="invite-scope"
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
                <Label htmlFor="invite-catchment">Catchment</Label>
                <select
                  id="invite-catchment"
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
              <Label htmlFor="invite-reason" required>Reason</Label>
              <Input
                id="invite-reason"
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
              {pending ? "Inviting…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
