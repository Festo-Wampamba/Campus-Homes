"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { appCallbackUrl, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/shell/wordmark";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    setError(null);
    const { error: requestError } = await authClient.requestPasswordReset({ email, redirectTo: appCallbackUrl("/reset-password") });
    setPending(false);
    if (requestError) {
      setError(requestError.message ?? "We could not send the reset email.");
      return;
    }
    setNotice("If an account exists for that email, a reset link is on its way.");
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-teal-900 px-4 py-8">
      <Card className="w-full max-w-sm shadow-xl">
        <CardContent className="p-6">
          <div className="mb-6 flex justify-center"><Wordmark stacked /></div>
          <h1 className="font-display text-xl font-bold text-foreground">Reset your password</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your account email and we’ll send a secure reset link.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2"><Label htmlFor="reset-email" required>Email</Label><Input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            {notice && <p role="status" className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">{notice}</p>}
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
            <Button type="submit" disabled={pending} className="w-full">{pending ? "Sending…" : "Send reset link"}</Button>
          </form>
          <Link href="/sign-in" className="mt-5 block text-center text-xs font-semibold text-teal-700 hover:underline dark:text-teal-300">Back to sign in</Link>
        </CardContent>
      </Card>
    </main>
  );
}
