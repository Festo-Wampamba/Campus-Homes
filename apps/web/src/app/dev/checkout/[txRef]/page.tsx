import { Suspense } from "react";
import { notFound } from "next/navigation";

import { StubCheckoutClient } from "./stub-checkout-client";

export default async function StubCheckoutPage({
  params,
}: {
  params: Promise<{ txRef: string }>;
}) {
  // This simulator can display caller-controlled payment details and redirect
  // targets. It is useful locally, but must never be exposed by a production
  // build (including staging deployments that run with NODE_ENV=production).
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  const { txRef } = await params;
  return (
    <Suspense>
      <StubCheckoutClient txRef={txRef} />
    </Suspense>
  );
}
