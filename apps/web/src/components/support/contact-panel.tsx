import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Mail, ShieldAlert, Sparkles } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ContactPanel({
  email,
  phone,
  desk,
  onAskAi,
  onOpenManual,
}: {
  email: string;
  phone: string;
  // The signed-in student's inquiry form + threads; null for everyone else.
  desk: ReactNode;
  onAskAi: () => void;
  onOpenManual: () => void;
}) {
  const whatsappDigits = phone.replace(/\D/g, "");

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        {whatsappDigits ? (
          <section className="flex flex-col rounded-xl border border-success/30 bg-success-subtle p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 text-lg">
              <WhatsAppIcon className="size-5 text-success" />
              WhatsApp support
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Chat directly with the CampusHomes team on WhatsApp.
            </p>
            <a href={`tel:${phone}`} className="mt-4 text-xl font-semibold tracking-wide hover:underline">
              {phone}
            </a>
            <a
              href={`https://wa.me/${whatsappDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "mt-4 bg-success text-success-foreground hover:bg-success/90")}
            >
              <WhatsAppIcon />
              Open WhatsApp chat
            </a>
          </section>
        ) : null}

        <section className={cn("flex flex-col rounded-xl border border-border bg-card p-5 sm:p-6", !whatsappDigits && "md:col-span-2")}>
          <h2 className="flex items-center gap-2.5 text-lg">
            <Sparkles aria-hidden className="size-5 text-teal-700 dark:text-teal-300" />
            Chat with CampusHomes AI
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Instant answers about finding, reserving and booking a room, any time of day.
          </p>
          <Button type="button" variant="secondary" className="mt-4 self-start" onClick={onAskAi}>
            Ask CampusHomes AI
          </Button>
        </section>
      </div>

      {desk ?? (
        <section className="rounded-xl border border-border bg-card p-5 text-sm sm:p-6">
          <h2 className="text-lg">Send us a message</h2>
          <p className="mt-2 leading-6 text-muted-foreground">
            Students can send our team a question about a listing or reservation and track replies here.{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent("/support?tab=contact")}`}
              className="font-semibold text-teal-700 underline underline-offset-4 dark:text-teal-300"
            >
              Sign in
            </Link>{" "}
            to send one.
          </p>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 text-lg">
            <Mail aria-hidden className="size-5 text-teal-700 dark:text-teal-300" />
            Email
          </h2>
          <a href={`mailto:${email}`} className="mt-2 inline-block text-sm font-semibold hover:underline">
            {email}
          </a>
        </section>

        <section className="flex gap-3 rounded-xl border border-border bg-card p-5 sm:p-6">
          <ShieldAlert aria-hidden className="size-5 shrink-0 text-destructive" />
          <div className="space-y-1 text-sm">
            <h2 className="text-base font-semibold">Report a safety concern or inaccurate listing</h2>
            <p className="leading-6 text-muted-foreground">
              Tell us the hostel name and your reservation reference, if you have one. Our team investigates
              every report.
            </p>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="flex items-center gap-2.5 text-lg">
            <BookOpen aria-hidden className="size-5 text-teal-700 dark:text-teal-300" />
            New to CampusHomes?
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The user manual walks you through finding, reserving and booking a room, step by step.
          </p>
        </div>
        <Button type="button" onClick={onOpenManual} className="shrink-0">
          Open the user manual
        </Button>
      </section>
    </div>
  );
}
