import type { Metadata } from "next";

import type { Inquiry } from "@campushomes/shared";

import { apiServer, apiServerStrict } from "@/lib/server-api";

import { InquiriesManager } from "@/components/inquiries/inquiries-manager";

export const metadata: Metadata = { title: "Student inquiries" };

export default async function AdminInquiriesPage() {
  const [inquiries, access] = await Promise.all([
    apiServerStrict<Inquiry[]>("/admin/inquiries"),
    apiServer<{ permissions: string[] }>("/admin/access/me"),
  ]);
  const canResolve = (access?.permissions ?? []).includes("inquiries.resolve");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold">Student inquiries</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Questions and reports submitted from the student support desk — each
          one also lands in the team inbox.
        </p>
      </header>
      <InquiriesManager initialInquiries={inquiries} canResolve={canResolve} />
    </div>
  );
}
