"use client";

import { useState } from "react";

import { PropertyQrCode } from "@/components/property-qr-code";
import { TenantAgreementBuilderDialog } from "@/components/tenant-agreement-builder-dialog";
import { Button } from "@/components/ui/button";

/** The student registration form and its QR poster, one property at a time. */
export function RegistrationFormSection({
  properties,
  initialPropertyId,
}: {
  properties: { id: string; name: string }[];
  /** From ?property= when a property window links here. */
  initialPropertyId?: string;
}) {
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? properties[0]?.id ?? "");
  const [builderOpen, setBuilderOpen] = useState(false);
  const property = properties.find((candidate) => candidate.id === propertyId) ?? properties[0];
  if (!property) return null;

  return (
    <section aria-labelledby="registration-form-heading" className="space-y-3">
      <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="registration-form-heading" className="text-sm font-semibold text-foreground">
            Student registration form
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Design the form students fill out and sign after scanning this property&apos;s QR code below.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button type="button" variant="secondary" size="sm" onClick={() => setBuilderOpen(true)}>
            Edit form
          </Button>
        </div>
      </div>
      <PropertyQrCode propertyId={property.id} propertyName={property.name} />
      <TenantAgreementBuilderDialog
        key={property.id}
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        propertyId={property.id}
        propertyName={property.name}
      />
    </section>
  );
}
