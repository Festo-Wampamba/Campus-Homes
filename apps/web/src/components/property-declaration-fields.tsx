"use client";

import type { ListingIntent } from "@campushomes/shared";

/** The landlord's own 5-item consent (Google Form "Consent & Declaration"
 * section, 0025) — mirrors TENANT_AGREEMENT_DECLARATION_TEXT's pattern as 5
 * discrete checkboxes instead of one block, matching the source form.
 * Submit-only: consent is a one-time act at property registration, not
 * something updatePropertySchema lets a landlord silently re-flip later. */
export type PropertyDeclarationFieldsValue = {
  declaredInfoAccurate: boolean;
  declaredAuthorityOverProperty: boolean;
  declaredWillKeepUpdated: boolean;
  declaredAuthorizesPublish: boolean;
  declaredConsentToProcessing: boolean;
};

export function emptyPropertyDeclarationFields(): PropertyDeclarationFieldsValue {
  return {
    declaredInfoAccurate: false,
    declaredAuthorityOverProperty: false,
    declaredWillKeepUpdated: false,
    declaredAuthorizesPublish: false,
    declaredConsentToProcessing: false,
  };
}

const DECLARATIONS: { key: keyof PropertyDeclarationFieldsValue; label: string }[] = [
  { key: "declaredInfoAccurate", label: "I confirm the information provided is accurate." },
  { key: "declaredAuthorityOverProperty", label: "I confirm I own or have authority over this property." },
  { key: "declaredWillKeepUpdated", label: "I agree to keep pricing and availability updated." },
  {
    key: "declaredAuthorizesPublish",
    label: "I authorise CampusHomes to publish approved listing information.",
  },
  { key: "declaredConsentToProcessing", label: "I consent to CampusHomes processing my data." },
];

// Nothing is published for a manage-only property, so it isn't asked.
function declarationsFor(listingIntent: ListingIntent) {
  return listingIntent === "list" ? DECLARATIONS : DECLARATIONS.filter((d) => d.key !== "declaredAuthorizesPublish");
}

export function propertyDeclarationsAllAccepted(
  v: PropertyDeclarationFieldsValue,
  listingIntent: ListingIntent = "list",
): boolean {
  return declarationsFor(listingIntent).every((d) => v[d.key]);
}

export function PropertyDeclarationFields({
  value,
  onChange,
  listingIntent = "list",
}: {
  value: PropertyDeclarationFieldsValue;
  onChange: (patch: Partial<PropertyDeclarationFieldsValue>) => void;
  listingIntent?: ListingIntent;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <p className="text-sm font-semibold text-foreground">Consent &amp; declaration</p>
      {declarationsFor(listingIntent).map((d) => (
        <label key={d.key} className="flex items-start gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            required
            checked={value[d.key]}
            onChange={(e) => onChange({ [d.key]: e.target.checked })}
            className="mt-0.5 size-4 shrink-0 rounded border-input"
          />
          {d.label}
        </label>
      ))}
    </div>
  );
}
