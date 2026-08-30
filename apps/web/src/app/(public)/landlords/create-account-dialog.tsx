"use client";

import { useState } from "react";
import { CheckCircle2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { api, apiErrorMessage } from "@/lib/api";

// Public, unauthenticated — creates a `users` row (role: landlord,
// status: pending) plus a credential account, so sign-in afterward is
// ordinary email+password. The account can't do anything (or even sign in
// past AuthGuard) until an ops lead/admin approves it from the /ops (or
// /admin) landlord-accounts queue.
export function CreateAccountDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim() && email.trim() && phone.trim() && password.length >= 8;

  function close(next: boolean) {
    setOpen(next);
    if (!next && done) {
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setDone(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setPending(true);
    setError(null);
    try {
      await api("/landlords/register", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: `+256${phone.replace(/\D/g, "").replace(/^0/, "")}`,
          password,
        }),
      });
      setDone(true);
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't create your account — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-coral-500 px-6 font-bold text-teal-900 transition duration-300 hover:bg-coral-600 hover:text-white active:scale-[0.98] sm:w-auto"
      >
        <UserPlus aria-hidden className="size-4" />
        Create your account
      </Button>
      <Dialog open={open} onOpenChange={close} size="sm">
        <DialogHeader
          title={done ? "Account created" : "Create your landlord account"}
          description={
            done
              ? undefined
              : "An ops lead reviews and approves new accounts before you can sign in."
          }
          onClose={() => close(false)}
        />
        <DialogBody>
          {done ? (
            <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-100">
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
              <p>
                We&apos;ve got your details — an ops lead will review your account shortly.
                Once approved, sign in at <a href="/sign-in" className="underline">/sign-in</a>{" "}
                with your email and password.
              </p>
            </div>
          ) : (
            <form id="create-landlord-account-form" onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="landlord-name" required>Full name</Label>
                <Input
                  id="landlord-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landlord-email" required>Email</Label>
                <Input
                  id="landlord-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landlord-phone" required>Phone number</Label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-base text-muted-foreground">
                    +256
                  </span>
                  <Input
                    id="landlord-phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="771 234 567"
                    required
                    className="rounded-l-none"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="landlord-password" required>Password</Label>
                <PasswordInput
                  id="landlord-password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                />
              </div>
              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
            </form>
          )}
        </DialogBody>
        <DialogFooter>
          {done ? (
            <Button type="button" onClick={() => close(false)}>
              Done
            </Button>
          ) : (
            <Button type="submit" form="create-landlord-account-form" disabled={pending || !valid}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    </>
  );
}
