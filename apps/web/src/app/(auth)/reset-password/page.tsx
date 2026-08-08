"use client";

import { FormEvent, useState } from "react";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Wordmark } from "@/components/shell/wordmark";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This reset link is missing or incomplete.");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError(null);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    setPending(false);
    if (resetError) {
      setError(resetError.message ?? "This reset link is invalid or expired.");
      return;
    }
    router.replace("/sign-in?reset=complete");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-teal-900 px-4 py-8">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="p-6">
          <div className="mb-6 flex justify-center"><Wordmark stacked /></div>
          <h1 className="font-display text-xl font-bold text-foreground">Choose a new password</h1>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="new-password" required>New password</Label><PasswordInput id="new-password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="confirm-password" required>Confirm password</Label><PasswordInput id="confirm-password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></div>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
            <Button type="submit" disabled={pending || !token} className="w-full">{pending ? "Updating…" : "Update password"}</Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-teal-900 text-sm text-white">Loading reset form…</main>}><ResetPasswordForm /></Suspense>;
}
