"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminField, adminFieldClass } from "@/components/admin/admin-modal";
import { PasswordInput } from "@/components/ui/password-input";
import { api, apiErrorMessage } from "@/lib/api";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({ email: email.trim() }),
      });
      setSaved(true);
      setEmail("");
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change your email — try signing in again first."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-muted-foreground">
        Signed in as <span className="font-bold text-slate-700 dark:text-foreground">{currentEmail ?? "—"}</span>. Changing this changes the email you sign in with. Requires a recent sign-in.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="New email" required>
          <input type="email" required autoComplete="email" className={adminFieldClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@campushomes.ug" />
        </AdminField>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !email.trim()} className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
          {pending ? "Saving…" : "Change email"}
        </button>
        {saved && <p className="text-sm font-semibold text-emerald-700">Email updated — use it next sign-in.</p>}
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
    try {
      await api("/me/password", { method: "PATCH", body: JSON.stringify({ newPassword }) });
      setSaved(true);
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't change your password — try signing in again first."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-muted-foreground">Requires a recent sign-in.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <AdminField label="New password" htmlFor="change-password-new" required hint="At least 8 characters.">
          <PasswordInput id="change-password-new" required minLength={8} autoComplete="new-password" className={adminFieldClass} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" />
        </AdminField>
        <AdminField label="Confirm new password" htmlFor="change-password-confirm" required>
          <PasswordInput id="change-password-confirm" required autoComplete="new-password" className={adminFieldClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" />
        </AdminField>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending || !newPassword || !confirmPassword} className="inline-flex h-10 items-center rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50">
          {pending ? "Saving…" : "Change password"}
        </button>
        {saved && <p className="text-sm font-semibold text-emerald-700">Password changed.</p>}
      </div>
    </form>
  );
}
