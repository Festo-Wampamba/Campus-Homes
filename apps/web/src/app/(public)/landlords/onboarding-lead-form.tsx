"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

/** Replaces the old mailto:-only "Request onboarding" CTA — a landlord far
 * from any CampusHomes team member (per the product meeting: "owners who
 * stay very far") shouldn't depend on an email client actually opening and
 * someone remembering to reply. This writes a real onboarding_leads row
 * (0027) that Ops works as a queue, same trust as any other intake form. No
 * auth: a prospective landlord has no account yet. */
export function OnboardingLeadForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [propertyLocation, setPropertyLocation] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/leads", {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          email: email || undefined,
          propertyLocation,
          message: message || undefined,
        }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't send this — try again, or call/email us directly."));
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <h3 className="text-lg font-semibold text-foreground">Thanks — we&apos;ve got it</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Our team will reach out to get your property onboarded.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lead-name" required>Your name</Label>
          <Input id="lead-name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-phone" required>Phone number</Label>
          <Input id="lead-phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+256…" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-email">Email (optional)</Label>
          <Input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-location" required>Where is your property?</Label>
          <Input
            id="lead-location"
            required
            value={propertyLocation}
            onChange={(e) => setPropertyLocation(e.target.value)}
            placeholder="e.g. Wandegeya, near Makerere"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lead-message">Anything else we should know? (optional)</Label>
        <textarea
          id="lead-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base text-foreground shadow-xs focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sending…" : "Request onboarding"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
