import type { Metadata } from "next";

import { IssueStrikeForm } from "./issue-strike-form";

export const metadata: Metadata = { title: "Issue landlord strike" };

export default function StrikesPage() {
  return (
    <>
      <h1 className="text-2xl">Issue a landlord strike</h1>
      <div className="mt-6 max-w-md">
        <IssueStrikeForm />
      </div>
    </>
  );
}
