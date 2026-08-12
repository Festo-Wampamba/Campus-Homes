"use client";

import { ArrowRight, Mail, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { appCallbackUrl, authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Wordmark } from "@/components/shell/wordmark";
import { homeForAuthenticatedRole } from "@/lib/auth-routing";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";
type Channel = "email" | "phone";
type PhoneStep = "number" | "otp";

// Local numbers like 0771 234 567 → E.164 (+256771234567)
function toE164(input: string): string {
  const digits = input.replace(/[^\d]/g, "");
  return `+256${digits.replace(/^0/, "")}`;
}

type AuthFailure = {
  status?: number;
  code?: string;
  message?: string;
};

function emailAuthFailureMessage(failure: unknown, mode: Mode): string {
  const error = failure as AuthFailure | null;
  if (error?.status === 401 || error?.code === "INVALID_EMAIL_OR_PASSWORD") {
    return "Email or password is incorrect.";
  }
  if (error?.code === "USER_ALREADY_EXISTS") {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (error?.status && error.status >= 500) {
    return "Authentication is temporarily unavailable. Please try again shortly.";
  }
  if (failure instanceof TypeError) {
    return "Cannot reach the CampusHomes API on port 4000. Start the local services and try again.";
  }
  return error?.message ?? (mode === "sign-up" ? "Could not create your account. Please try again." : "Sign-in failed. Please try again.");
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#4285F4" d="M23.766 12.276c0-.818-.074-1.606-.213-2.364H12.24v4.474h6.482a5.54 5.54 0 0 1-2.4 3.633v3.02h3.885c2.274-2.093 3.559-5.176 3.559-8.763z" />
      <path fill="#34A853" d="M12.24 24c3.24 0 5.956-1.075 7.941-2.91l-3.885-3.02c-1.077.72-2.454 1.147-4.056 1.147-3.12 0-5.763-2.107-6.708-4.938H1.51v3.114A11.997 11.997 0 0 0 12.24 24z" />
      <path fill="#FBBC05" d="M5.532 14.279A7.2 7.2 0 0 1 5.153 12c0-.791.136-1.56.379-2.279V6.607H1.51A11.997 11.997 0 0 0 .24 12c0 1.936.463 3.767 1.27 5.393l4.022-3.114z" />
      <path fill="#EA4335" d="M12.24 4.773c1.763 0 3.346.606 4.591 1.796l3.444-3.444C18.19 1.186 15.475 0 12.24 0 7.518 0 3.44 2.71 1.51 6.607l4.022 3.114c.945-2.831 3.588-4.948 6.708-4.948z" />
    </svg>
  );
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
    <div className="flex justify-center gap-1.5 sm:gap-2" role="group" aria-label="6-digit SMS code">
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
            "h-11 w-9 rounded-md border text-center font-display text-lg font-bold text-foreground shadow-xs transition-colors duration-150 sm:h-12 sm:w-10",
            "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            digit ? "border-primary bg-accent" : "border-input bg-background",
          )}
        />
      ))}
    </div>
  );
}

export function SignInForm() {
  const router = useRouter();
  const [mode, setModeState] = useState<Mode>("sign-in");
  const [channel, setChannelState] = useState<Channel>("email");
  const [phoneStep, setPhoneStep] = useState<PhoneStep>("number");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setModeState(next);
    setChannelState("email");
    setPhoneStep("number");
    setError(null);
    setNotice(null);
    setVerificationEmail(null);
  }

  function switchChannel(next: Channel) {
    setChannelState(next);
    setPhoneStep("number");
    setError(null);
    setNotice(null);
    setVerificationEmail(null);
  }

  async function signInWithGoogle() {
    setError(null);
    setNotice(null);
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: appCallbackUrl("/auth/callback"),
    });
    if (error) {
      setPending(false);
      setError(error.message ?? "Google sign-in could not be started. Please try again.");
    }
  }

  async function routeBySession() {
    const { data, error } = await authClient.getSession();
    if (error) throw error;
    const sessionRole = data?.user
      ? (data.user as { role?: string }).role
      : undefined;
    router.replace(homeForAuthenticatedRole(sessionRole));
    router.refresh();
  }

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);
    const { error } = await authClient.phoneNumber.sendOtp({
      phoneNumber: toE164(phone),
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "We couldn't send the code — try again.");
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      setNotice("Local dev mode: check the backend terminal for the OTP code.");
    }
    setResendCooldown(30);
    setPhoneStep("otp");
  }

  async function resendOtp() {
    if (resendCooldown > 0) return;
    setError(null);
    setPending(true);
    const { error } = await authClient.phoneNumber.sendOtp({ phoneNumber: toE164(phone) });
    setPending(false);
    if (error) {
      setError(error.message ?? "We couldn't resend the code — try again.");
      return;
    }
    setResendCooldown(30);
    setNotice(process.env.NODE_ENV !== "production" ? "Local dev mode: check the backend terminal for the new OTP." : "A new code is on its way.");
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
    try {
      await routeBySession();
    } catch (error) {
      setPending(false);
      setError(
        error instanceof Error
          ? error.message
          : "Sign-in succeeded, but the secure session could not be verified. Please try again.",
      );
    }
  }

  async function emailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error } =
        mode === "sign-up"
          ? await authClient.signUp.email({ name, email, password })
          : await authClient.signIn.email({ email, password });
      if (error) {
        if (error.code === "EMAIL_NOT_VERIFIED") {
          setVerificationEmail(email);
          setError("Verify your email before signing in.");
        } else {
          setError(emailAuthFailureMessage(error, mode));
        }
        return;
      }
      if (mode === "sign-up") {
        setNotice("Check your email to verify your account before signing in.");
        return;
      }
      await routeBySession();
    } catch (error) {
      setError(emailAuthFailureMessage(error, mode));
    } finally {
      setPending(false);
    }
  }

  async function resendVerificationEmail() {
    if (!verificationEmail) return;
    setPending(true);
    setError(null);
    const { error } = await authClient.sendVerificationEmail({ email: verificationEmail, callbackURL: appCallbackUrl("/auth/callback") });
    setPending(false);
    if (error) {
      setError(error.message ?? "We could not resend the verification email.");
      return;
    }
    setNotice("A fresh verification link is on its way.");
  }

  return (
    <Card className="w-full max-w-sm shadow-xl">
      <CardContent className="p-4 sm:p-6">
        <div className="mb-3 flex flex-col items-center gap-1 sm:mb-4">
          <Wordmark stacked />
        </div>

        <div className="mb-3 flex rounded-lg border border-border bg-muted p-1 sm:mb-4">
          <button
            type="button"
            aria-pressed={mode === "sign-in"}
            onClick={() => switchMode("sign-in")}
            className={cn(
              "flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
              mode === "sign-in" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Sign In
          </button>
          <button
            type="button"
            aria-pressed={mode === "sign-up"}
            onClick={() => switchMode("sign-up")}
            className={cn(
              "flex-1 rounded-md px-2 py-2 text-xs font-semibold transition-colors sm:px-3 sm:text-sm",
              mode === "sign-up" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Create Account
          </button>
        </div>

        {notice && (
          <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
            {notice}
          </div>
        )}

        {channel === "email" ? (
          <form onSubmit={emailSubmit} className="space-y-3">
            {mode === "sign-up" && (
              <div className="space-y-1.5">
                <Label htmlFor="name" required>Full name</Label>
                <Input id="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email" required>Email</Label>
              <Input id="email" type="email" autoComplete="email" placeholder="Enter your email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" required>Password</Label>
              <PasswordInput
                id="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                placeholder="Enter your password"
                required
                minLength={mode === "sign-up" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={pending} className="w-full gap-2">
              <ArrowRight aria-hidden className="size-4" />
              {pending ? (mode === "sign-up" ? "Creating account…" : "Signing in…") : mode === "sign-up" ? "Create account" : "Sign In"}
            </Button>

            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={signInWithGoogle}
              className="w-full gap-1.5 text-sm sm:gap-2"
            >
              <GoogleIcon />
              <span className="min-w-0 flex-1 truncate text-left">Continue with Google</span>
            </Button>

            {mode === "sign-in" && (
              <a href="/forgot-password" className="block text-center text-xs font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300">
                Forgot your password?
              </a>
            )}

            <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => switchChannel("phone")}>
              <Smartphone aria-hidden className="size-3.5" />
              Use phone number instead
            </Button>
          </form>
        ) : phoneStep === "number" ? (
          <form onSubmit={sendOtp} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="phone" required>Student phone number</Label>
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
            <Button type="submit" disabled={pending} className="w-full gap-2">
              <ArrowRight aria-hidden className="size-4" />
              {pending ? "Sending code…" : "Send SMS code"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full gap-1.5" onClick={() => switchChannel("email")}>
              <Mail aria-hidden className="size-3.5" />
              Use email instead
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <p className="text-center text-xs text-muted-foreground">
              Enter the code sent to <span className="font-semibold text-foreground">{toE164(phone)}</span>
            </p>
            <OtpBoxes value={code} onChange={setCode} />
            <Button type="submit" disabled={pending || code.length < 6} className="w-full gap-2">
              <ArrowRight aria-hidden className="size-4" />
              {pending ? "Checking…" : "Verify and continue"}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setCode(""); setPhoneStep("number"); setError(null); }}>
              Use a different number
            </Button>
            <Button type="button" variant="ghost" size="sm" className="w-full" disabled={pending || resendCooldown > 0} onClick={resendOtp}>
              {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
            </Button>
          </form>
        )}

        <p aria-live="polite" role="status" className="mt-3 min-h-5 text-center text-xs text-destructive">
          {error}
        </p>
        {verificationEmail && (
          <Button type="button" variant="ghost" size="sm" className="w-full" disabled={pending} onClick={resendVerificationEmail}>
            Resend verification email
          </Button>
        )}

        <p className="mt-1 text-center text-[10px] leading-relaxed text-muted-foreground">
          By continuing you agree to our Terms & Data Handling under the Uganda Data Protection Act 2019
        </p>
      </CardContent>
    </Card>
  );
}
