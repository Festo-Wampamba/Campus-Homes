"use client";

import { useState } from "react";

import { PropertyQrCode } from "@/components/property-qr-code";

/** The QR poster that sends students to create their account, one property at a time. */
export function SignUpQrSection({
  properties,
  initialPropertyId,
}: {
  properties: { id: string; name: string }[];
  /** From ?property= when a property window links here. */
  initialPropertyId?: string;
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? properties[0]?.id ?? "");
  const property = properties.find((candidate) => candidate.id === propertyId) ?? properties[0];
  if (!property) return null;

  return (
    <section id="sign-up-qr" aria-label="Student sign-up QR code" className="space-y-3">
      {properties.length > 1 && (
        <select
          aria-label="Property"
          value={property.id}
          onChange={(event) => setPropertyId(event.target.value)}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 [&>option]:bg-card [&>option]:text-foreground"
        >
          {properties.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      )}
      <PropertyQrCode propertyId={property.id} propertyName={property.name} />
    </section>
  );
}
