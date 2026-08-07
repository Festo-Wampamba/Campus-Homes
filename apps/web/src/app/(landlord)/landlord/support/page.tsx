import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = { title: "Support & Help" };

const FAQS = [
  {
    q: "Why is my listing still \"pending\"?",
    a: "A listing goes verified only after Ops completes a lead-approved visit that passes all six checklist components. You can track KYC/verification status from My Properties.",
  },
  {
    q: "How do I add or edit rooms?",
    a: "Ops creates and edits rooms once your property is published. You can upload per-room photos yourself from My Properties → open a property → expand a room.",
  },
  {
    q: "How do students contact me?",
    a: "Once a student places a hold on one of your rooms, a conversation opens automatically under Messages.",
  },
];

export default function LandlordSupportPage() {
  return (
    <>
      <h1 className="text-2xl">Support & Help</h1>
      <p className="mt-1 text-sm text-muted-foreground">Answers to common questions, and how to reach us.</p>

      <div className="mt-6 space-y-3">
        {FAQS.map((item) => (
          <Card key={item.q}>
            <CardContent className="p-4">
              <p className="font-semibold text-foreground">{item.q}</p>
              <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6">
        <Link href="/landlord/messages" className={buttonVariants({ variant: "primary" })}>
          <MessageCircle aria-hidden className="size-4" />
          Go to Messages
        </Link>
      </div>
    </>
  );
}
