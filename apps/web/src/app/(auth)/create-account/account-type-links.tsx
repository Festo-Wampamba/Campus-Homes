"use client";
import { Building2, GraduationCap } from "lucide-react";
import { signInUrl } from "@/lib/auth";

export const REGISTRATION_CHOICE_KEY = "campushomes:registration-choice";
export function AccountTypeLinks({ next }: { next: string | null }) {
  return <div className="mt-6 space-y-3">{([
    { type: "student", title: "Student account", description: "Find and book student accommodation.", icon: GraduationCap, next: next ?? "/" },
    { type: "landlord", title: "Landlord account", description: "List properties and manage your accommodation.", icon: Building2, next: "/landlords/enroll" },
  ] as const).map(option => <a key={option.type} href={signInUrl("consumer", option.next, option.type, "register")}
    onClick={() => { try { sessionStorage.setItem(REGISTRATION_CHOICE_KEY, option.type); } catch { /* Profile setup will ask again. */ } }}
    className="flex min-h-20 items-center gap-4 rounded-xl border border-border p-4 transition-colors hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
    <option.icon aria-hidden className="size-7 shrink-0 text-primary" /><span><strong className="block">{option.title}</strong><span className="mt-1 block text-sm text-muted-foreground">{option.description}</span></span>
  </a>)}</div>;
}
