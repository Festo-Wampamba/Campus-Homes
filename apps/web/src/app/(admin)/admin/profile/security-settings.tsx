"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminField, adminFieldClass } from "@/components/admin/admin-modal";
import { PasswordInput } from "@/components/ui/password-input";
import { api, apiErrorMessage } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      await api("/me/email", {
        method: "PATCH",
        body: JSON.stringify({ email: email.trim(), currentPassword }),
      });
      setSaved(true);
      setEmail("");
      setCurrentPassword("");
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change your email — check your password and try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-muted-foreground">
        Signed in as <span className="font-bold text-slate-700 dark:text-foreground">{currentEmail ?? "—"}</span>. Changing this changes the email you sign in with.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="New email" required>
          <input type="email" required autoComplete="email" className={adminFieldClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campushomes.ug" />
        </AdminField>
        <AdminField label="Current password" htmlFor="change-email-current-password" required>
          <PasswordInput id="change-email-current-password" required autoComplete="current-password" className={adminFieldClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
        </AdminField>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !email.trim() || !currentPassword} className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
          {pending ? "Saving…" : "Change email"}
        </button>
        {saved && <p className="text-sm font-semibold text-emerald-700">Email updated — use it next sign-in.</p>}
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation don't match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setPending(true);
    // Better Auth's own endpoint — verifies the current password and rehashes
    // server-side; revokeOtherSessions signs out every other device.
    const { error: authError } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions,
    });
    setPending(false);
    if (authError) {
      setError(authError.message ?? "Couldn't change your password — check the current password.");
      return;
    }
    setSaved(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <AdminField label="Current password" htmlFor="change-password-current" required>
          <PasswordInput id="change-password-current" required autoComplete="current-password" className={adminFieldClass} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="••••••••" />
        </AdminField>
        <AdminField label="New password" htmlFor="change-password-new" required hint="At least 8 characters.">
          <PasswordInput id="change-password-new" required minLength={8} autoComplete="new-password" className={adminFieldClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
        </AdminField>
        <AdminField label="Confirm new password" htmlFor="change-password-confirm" required>
          <PasswordInput id="change-password-confirm" required autoComplete="new-password" className={adminFieldClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
        </AdminField>
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-foreground">
        <input type="checkbox" checked={revokeOtherSessions} onChange={(e) => setRevokeOtherSessions(e.target.checked)} />
        Sign out all other devices
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !currentPassword || !newPassword || !confirmPassword} className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
          {pending ? "Saving…" : "Change password"}
        </button>
        {saved && <p className="text-sm font-semibold text-emerald-700">Password changed.</p>}
      </div>
    </form>
  );
}
