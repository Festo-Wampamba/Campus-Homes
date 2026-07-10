"use client";

import { GraduationCap, Home, Shield, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";

type Role = "student" | "landlord" | "admin" | "ops";
type Screen = "landing" | "phone" | "otp" | "staff";

const HOME_BY_ROLE: Record<string, string> = {
  student: "/",
  landlord: "/landlord",
  ops_inspector: "/ops",
  ops_lead: "/ops",
  admin: "/ops",
};

const ROLES: {
  id: Role;
  label: string;
  description: string;
  icon: typeof GraduationCap;
  iconClassName: string;
}[] = [
  {
    id: "student",
    label: "Student",
    description: "Looking for verified housing near campus",
    icon: GraduationCap,
    iconClassName: "bg-teal-100 text-teal-700",
  },
  {
    id: "landlord",
    label: "Landlord",
    description: "I manage a hostel or rental property",
    icon: Home,
    iconClassName: "bg-coral-500/15 text-coral-600",
  },
  {
    id: "admin",
    label: "Admin",
    description: "Platform-wide oversight & controls",
    icon: Shield,
    iconClassName: "bg-indigo-100 text-indigo-600",
  },
  {
    id: "ops",
    label: "Operations staff",
    description: "I verify properties & handle support",
    icon: Wrench,
    iconClassName: "bg-warning-subtle text-warning",
  },
];

// Local numbers like 0771 234 567 → E.164 (+256771234567)
function toE164(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  return `+256${digits.replace(/^0/, "")}`;
}

function OtpBoxes({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? "");
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  function setDigit(index: number, char: string) {
    const next = digits.slice();
    next[index] = char;
    onChange(next.join(""));
    if (char && index < 5) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/[^\d]/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted.padEnd(6, "").slice(0, 6));
    inputsRef.current[Math.min(pasted.length, 5)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" role="group" aria-label="6-digit SMS code">
      {digits.map((digit, i) => (
        <input
          key={i}
          id={`otp-digit-${i}`}
          name={`otp-digit-${i}`}
          ref={(el) => {
            inputsRef.current[i] = el;
          }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Digit ${i + 1} of 6`}
          maxLength={1}
          value={digit}
          onChange={(e) => setDigit(i, e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={cn(
            "h-[52px] w-11 rounded-md border text-center font-display text-xl font-bold text-foreground shadow-xs transition-colors duration-150",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            digit ? "border-primary bg-accent" : "border-input bg-background",
          )}
        />
      ))}
    </div>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
    >
      ← {children}
    </button>
  );
}

export function SignInForm() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("landing");
  const [role, setRole] = useState<Role | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleLabel = ROLES.find((r) => r.id === role)?.label ?? "";

  async function routeBySession() {
    const { data } = await authClient.getSession();
    const sessionRole = data?.user
      ? (data.user as { role?: string }).role
      : undefined;
    router.push(HOME_BY_ROLE[sessionRole ?? "student"] ?? "/");
    router.refresh();
  }

  function continueFromLanding() {
    if (!role) return;
    setError(null);
    setScreen(role === "admin" || role === "ops" ? "staff" : "phone");
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber: toE164(phone),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "We couldn't send the code — try again.");
      return;
    }
    setScreen("otp");
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.phoneNumber.verify({
      phoneNumber: toE164(phone),
      code,
    });
    if (error) {
      setPending(false);
      setError(error.message ?? "That code didn't match — try again.");
      return;
    }
    await routeBySession();
  }

  async function staffSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      setPending(false);
      setError(error.message ?? "Sign-in failed — check your details.");
      return;
    }
    await routeBySession();
  }

  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardContent className="p-6 sm:p-8">
        {screen === "landing" && (
          <>
            <div className="mb-6 flex flex-col items-center gap-1.5">
              <Wordmark stacked />
            </div>
            <h1 className="mb-1 text-center font-display text-lg font-bold text-foreground">
              Welcome to CampusHomes
            </h1>
            <p className="mb-5 text-center text-sm text-muted-foreground">
              Select how you&apos;ll sign in
            </p>
            <div role="radiogroup" aria-label="Sign-in role" className="space-y-2.5">
              {ROLES.map(({ id, label, description, icon: Icon, iconClassName }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={role === id}
                  onClick={() => setRole(id)}
                  className={cn(
                    "flex w-full items-center gap-3.5 rounded-lg border p-4 text-left transition-colors duration-150",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    role === id
                      ? "border-primary bg-accent"
                      : "border-border hover:border-muted-foreground/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-md",
                      iconClassName,
                    )}
                  >
                    <Icon aria-hidden className="size-5" strokeWidth={2} />
                  </span>
                  <span>
                    <span className="block font-display text-sm font-semibold text-foreground">
                      {label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <Button
              type="button"
              disabled={!role}
              onClick={continueFromLanding}
              className="mt-5 w-full"
            >
              Continue
            </Button>
          </>
        )}

        {screen === "phone" && (
          <>
            <BackLink onClick={() => setScreen("landing")}>
              Choose a different role
            </BackLink>
            <div className="mb-6 flex justify-center">
              <Wordmark />
            </div>
            <h1 className="mb-1 text-center font-display text-lg font-bold text-foreground">
              Sign in as {roleLabel}
            </h1>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Verified student housing, made simple
            </p>
            <form onSubmit={sendOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone number</Label>
                <div className="flex">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-base text-muted-foreground">
                    +256
                  </span>
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="771 234 567"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-l-none"
                  />
                </div>
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Sending code…" : "Send SMS code"}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              By continuing you agree to our Terms & Data Handling under the
              Uganda Data Protection Act 2019
            </p>
          </>
        )}

        {screen === "otp" && (
          <>
            <BackLink onClick={() => setScreen("phone")}>Edit number</BackLink>
            <h1 className="mb-1 font-display text-lg font-bold text-foreground">
              Enter the code sent to
            </h1>
            <p className="mb-6 font-display text-base font-semibold text-primary">
              {toE164(phone)}
            </p>
            <form onSubmit={verifyOtp} className="space-y-5">
              <OtpBoxes value={code} onChange={setCode} />
              <Button
                type="submit"
                disabled={pending || code.length < 6}
                className="w-full"
              >
                {pending ? "Checking…" : "Verify and sign in"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => {
                  setCode("");
                  setScreen("phone");
                }}
              >
                Use a different number
              </Button>
            </form>
          </>
        )}

        {screen === "staff" && (
          <>
            <BackLink onClick={() => setScreen("landing")}>
              Choose a different role
            </BackLink>
            <h1 className="mb-1 font-display text-lg font-bold text-foreground">
              Internal sign in
            </h1>
            <p className="mb-4 text-sm text-muted-foreground">
              For Operations & Admin staff only
            </p>
            <div className="mb-5 inline-flex items-center gap-2 rounded-md border border-primary/30 bg-accent px-3 py-2 text-sm font-semibold text-teal-700">
              Signing in as {roleLabel}
            </div>
            <form onSubmit={staffSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </>
        )}

        <p aria-live="polite" role="status" className="mt-4 min-h-5 text-sm text-destructive">
          {error}
        </p>
      </CardContent>
    </Card>
  );
}
