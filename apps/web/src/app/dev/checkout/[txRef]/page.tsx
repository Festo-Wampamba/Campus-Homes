import { Suspense } from "react";

import { StubCheckoutClient } from "./stub-checkout-client";

export default async function StubCheckoutPage({
  params,
}: {
  params: Promise<{ txRef: string }>;
}) {
  const { txRef } = await params;
  return (
    <Suspense>
      <StubCheckoutClient txRef={txRef} />
    </Suspense>
  );
}
