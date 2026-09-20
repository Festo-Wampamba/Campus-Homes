"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

export function OnboardingForm({ initialName, initialUsername }: { initialName: string; initialUsername: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usernameValid = USERNAME_PATTERN.test(username);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your full name.");
    if (!usernameValid) return setError("Username must be 3–20 letters, numbers or underscores.");
    setPending(true);
    try {
      await api("/me/onboarding", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), username: username.toLowerCase() }),
      });
      // The identity gate reads the session server-side, so a full navigation
      // (not just router.refresh) is what re-runs it with the new profile.
      router.replace("/choose-workspace");
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't save your profile — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-name">Full name</Label>
        <Input id="onboarding-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-username">Username</Label>
        <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:ring-2 focus-within:ring-teal-600">
          <span aria-hidden className="text-sm text-muted-foreground">@</span>
          <input
            id="onboarding-username"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
            maxLength={20}
            placeholder="janedoe"
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <p className="text-xs text-muted-foreground">3–20 characters: letters, numbers, underscores.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={pending || !name.trim() || !usernameValid} className="w-full">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
