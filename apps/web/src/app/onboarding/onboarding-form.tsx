"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { africanPhone } from "@campushomes/shared";

import { PhoneField } from "@/components/phone-field";
import { IDLE_SIGN_OUT_EVENT, useIdleDraft } from "@/lib/idle-timeout";
import { api, ApiError, apiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

const selectClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
);

export function OnboardingForm({
  userId,
  staff = false,
  initialName,
  initialUsername,
  initialPhone,
  askGender = false,
  initialGender = "",
  next,
}: {
  userId: string;
  staff?: boolean;
  initialName: string;
  initialUsername: string;
  initialPhone: string;
  /** Students and landlords must choose one; staff aren't asked. */
  askGender?: boolean;
  initialGender?: string;
  next: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [phone, setPhone] = useState(initialPhone);
  const [phoneRestoreKey, setPhoneRestoreKey] = useState(0);
  const [gender, setGender] = useState(initialGender);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [sessionExpired, setSessionExpired] = useState(false);
  const { draft, settle } = useIdleDraft<{ name: string; username: string; phone: string; gender: string }>(
    `campushomes:onboarding:${userId}`, { name, username, phone, gender },
  );
  const signIn = `${staff ? "/staff" : "/sign-in"}?${new URLSearchParams({ error: "session_ended", next })}`;

  const usernameValid = USERNAME_PATTERN.test(username);
  const phoneCheck = africanPhone.safeParse(phone);
  const phoneError = phone && !phoneCheck.success ? phoneCheck.error.issues[0]?.message : undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Enter your full name.");
    if (!usernameValid) return setError("Username must be 3–20 letters, numbers or underscores.");
    if (askGender && !gender) return setError("Choose your gender.");
    if (!phoneCheck.success) return setError(phoneCheck.error.issues[0]?.message ?? "Enter a valid mobile number.");
    setPending(true);
    try {
      await api("/me/onboarding", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), username: username.toLowerCase(), contactPhone: phone, ...(askGender ? { gender } : {}) }),
      });
      // The identity gate reads the session server-side, so a full navigation
      // (not just router.refresh) is what re-runs it with the new profile.
      settle();
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.dispatchEvent(new Event(IDLE_SIGN_OUT_EVENT));
        setSessionExpired(true);
        setError("Your session has ended. Sign in again to continue. Any entries saved in this tab can be restored.");
        return;
      }
      setError(apiErrorMessage(err, "Couldn't save your profile. Try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {draft && !sessionExpired && <div className="rounded-md border p-3 text-sm">
        <p>Your unfinished profile is saved in this tab.</p>
        <div className="mt-2 flex flex-wrap gap-3">
          <button type="button" className="font-semibold text-primary underline" onClick={() => {
            if ([draft.name, draft.username, draft.phone, draft.gender].every(value => typeof value === "string")) {
              setName(draft.name); setUsername(draft.username); setPhone(draft.phone); setPhoneRestoreKey(value => value + 1); setGender(draft.gender);
            }
            settle();
          }}>Restore entries</button>
          <button type="button" className="underline" onClick={settle}>Discard</button>
        </div>
      </div>}
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-name" required>Full name</Label>
        <Input id="onboarding-name" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Muwanguzi Festo" aria-describedby="onboarding-name-hint" />
        <p id="onboarding-name-hint" className="text-xs text-muted-foreground">As it appears on your student ID.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="onboarding-username" required>Username</Label>
        <Input
          id="onboarding-username"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))}
          maxLength={20}
          placeholder="e.g. muwanguzi_f"
          aria-describedby="onboarding-username-hint"
        />
        <p id="onboarding-username-hint" className="text-xs text-muted-foreground">3–20 letters, numbers or underscores. Other people may use the same username; sign in with your verified email or phone.</p>
      </div>
      <PhoneField
        key={phoneRestoreKey}
        className="[&>div]:flex-wrap [&_select]:min-w-0 [&_select]:max-w-full [&_select]:flex-1 [&_select]:basis-40 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:basis-40"
        id="onboarding-phone"
        label="Phone number"
        required
        value={phone}
        onChange={setPhone}
        placeholder="e.g. 772 123 456"
        hint={phoneError ?? "So landlords and our team can reach you."}
        labelClassName="text-sm font-semibold"
        hintClassName={phoneError ? "text-xs text-destructive" : "text-xs"}
      />
      {askGender && (
        <div className="space-y-1.5">
          <Label htmlFor="onboarding-gender" required>Gender</Label>
          <select
            id="onboarding-gender"
            required
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className={selectClass}
            aria-describedby="onboarding-gender-hint"
          >
            <option value="" disabled>Choose…</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
          <p id="onboarding-gender-hint" className="text-xs text-muted-foreground">Many hostels are single-gender, so this helps match you to the right rooms.</p>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {sessionExpired && <a href={signIn} className="block font-semibold text-primary underline">Sign in again</a>}
      <Button type="submit" disabled={sessionExpired || pending || !name.trim() || !usernameValid || !phoneCheck.success || (askGender && !gender)} className="w-full">
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}
