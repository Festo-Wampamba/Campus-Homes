"use client";

import { useState } from "react";
import { X } from "lucide-react";
import {
  GENDER_ARRANGEMENTS,
  NEARBY_INSTITUTIONS,
  PROPERTY_AUTHORITY_ROLES,
  RENT_PERIODS,
  type GenderArrangement,
  type PropertyAuthorityRole,
  type RentPeriod,
} from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCESSIBILITY_FEATURE_OPTIONS,
  GENDER_ARRANGEMENT_LABELS,
  PROPERTY_AUTHORITY_ROLE_LABELS,
  RENT_PERIOD_LABELS,
  SECURITY_FEATURE_OPTIONS,
  UTILITY_OPTIONS,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
);

/** The remaining fields from the Google Form's "Landlord & Property
 * Registration Form" (0025) that don't already have a home elsewhere in the
 * onboarding/edit UI — property identity, location, authority-over-property,
 * room aggregates, utilities/security/accessibility checklists. Shared by
 * the landlord onboarding wizard, the post-onboarding property-form-dialog,
 * and the admin console's properties-manager, since all four write paths
 * (submitProperty/updateProperty, admin create/update) use identical field
 * names — see packages/shared/src/property.ts and admin.ts. */
export type PropertyExtendedFieldsValue = {
  alternativeName: string;
  locationDetails: string;
  genderArrangement: GenderArrangement | "";
  // Free text, not the University enum — see NEARBY_INSTITUTIONS' comment in
  // packages/shared/src/property.ts for why this stays separate from the
  // primary `catchment` field (search/RLS scoping vs. purely informational).
  otherCatchments: string[];
  authorityRole: PropertyAuthorityRole | "";
  authorityRoleOther: string;
  transportShuttle: boolean;
  advanceRentRequired: boolean;
  bookingFeePercent: string;
  rentPeriod: RentPeriod | "";
  rentPeriodOther: string;
  selfContainedRoomCount: string;
  nonSelfContainedRoomCount: string;
  // Google Form "Utilities Included" (furnishing-level) — distinct from the
  // properties.utilities column (admin-only water/electricity/internet/
  // waste-collection status), hence the different field name here.
  furnishingItems: Record<string, boolean>;
  securityFeatures: Record<string, boolean>;
  accessibilityFeatures: Record<string, boolean>;
  photographyConsent: boolean;
};

export function emptyPropertyExtendedFields(): PropertyExtendedFieldsValue {
  return {
    alternativeName: "",
    locationDetails: "",
    genderArrangement: "",
    otherCatchments: [],
    authorityRole: "",
    authorityRoleOther: "",
    transportShuttle: false,
    advanceRentRequired: false,
    bookingFeePercent: "",
    rentPeriod: "",
    rentPeriodOther: "",
    selfContainedRoomCount: "",
    nonSelfContainedRoomCount: "",
    furnishingItems: {},
    securityFeatures: {},
    accessibilityFeatures: {},
    photographyConsent: false,
  };
}

function CheckboxGrid({
  options,
  value,
  onChange,
  bordered = true,
}: {
  options: { key: string; label: string }[];
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
  // false lets a caller combine several CheckboxGrids inside one shared
  // border, so they read as one section instead of several visually
  // separate boxes (2026-08-30 product review — utilities/security used to
  // each get their own labeled box, which read as more sections than the
  // data actually needed).
  bordered?: boolean;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 p-3 sm:grid-cols-3", bordered && "rounded-md border border-border")}>
      {options.map((option) => (
        <label key={option.key} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value[option.key] ?? false}
            onChange={(e) => onChange({ ...value, [option.key]: e.target.checked })}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function PropertyExtendedFields({
  value,
  onChange,
  idPrefix,
}: {
  value: PropertyExtendedFieldsValue;
  onChange: (patch: Partial<PropertyExtendedFieldsValue>) => void;
  idPrefix: string;
}) {
  const [customInstitution, setCustomInstitution] = useState("");
  const customInstitutions = value.otherCatchments.filter(
    (name) => !(NEARBY_INSTITUTIONS as readonly string[]).includes(name),
  );

  function addCustomInstitution() {
    const name = customInstitution.trim();
    if (!name || value.otherCatchments.includes(name)) return;
    onChange({ otherCatchments: [...value.otherCatchments, name] });
    setCustomInstitution("");
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-altName`}>Alternative name</Label>
          <Input
            id={`${idPrefix}-altName`}
            value={value.alternativeName}
            onChange={(e) => onChange({ alternativeName: e.target.value })}
            placeholder="Also known as…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-genderArrangement`}>Gender arrangement</Label>
          <select
            id={`${idPrefix}-genderArrangement`}
            value={value.genderArrangement}
            onChange={(e) => onChange({ genderArrangement: e.target.value as GenderArrangement | "" })}
            className={selectClass}
          >
            <option value="">Not specified</option>
            {GENDER_ARRANGEMENTS.map((g) => (
              <option key={g} value={g}>
                {GENDER_ARRANGEMENT_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-locationDetails`}>Country, district, village/zone, nearest landmark</Label>
        <Input
          id={`${idPrefix}-locationDetails`}
          value={value.locationDetails}
          onChange={(e) => onChange({ locationDetails: e.target.value })}
          placeholder="e.g. Uganda, Kampala, Wandegeya, opposite Total fuel station"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Also close to (optional)</Label>
        <p className="text-xs text-muted-foreground">
          Other institutes or colleges students here might attend, beyond the nearest university.
        </p>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
          {NEARBY_INSTITUTIONS.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.otherCatchments.includes(name)}
                onChange={(e) =>
                  onChange({
                    otherCatchments: e.target.checked
                      ? [...value.otherCatchments, name]
                      : value.otherCatchments.filter((x) => x !== name),
                  })
                }
              />
              {name}
            </label>
          ))}
        </div>
        {customInstitutions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {customInstitutions.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
              >
                {name}
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    onChange({ otherCatchments: value.otherCatchments.filter((x) => x !== name) })
                  }
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={customInstitution}
            onChange={(e) => setCustomInstitution(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomInstitution();
              }
            }}
            placeholder="Not listed? Add it…"
            className="h-9"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addCustomInstitution}>
            Add
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-authorityRole`} required>
            Your role in relation to this property
          </Label>
          <select
            id={`${idPrefix}-authorityRole`}
            required
            value={value.authorityRole}
            onChange={(e) => onChange({ authorityRole: e.target.value as PropertyAuthorityRole | "" })}
            className={selectClass}
          >
            <option value="" disabled>
              Select…
            </option>
            {PROPERTY_AUTHORITY_ROLES.map((r) => (
              <option key={r} value={r}>
                {PROPERTY_AUTHORITY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {value.authorityRole === "other" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-authorityRoleOther`} required>
              Describe your role
            </Label>
            <Input
              id={`${idPrefix}-authorityRoleOther`}
              required
              value={value.authorityRoleOther}
              onChange={(e) => onChange({ authorityRoleOther: e.target.value })}
            />
          </div>
        )}
      </div>

      {/* Self-contained/non-self-contained counts are no longer entered here —
          they're derived from the "self-contained" checkbox on each room-type
          row above, so a landlord enters that distinction once, in one
          place, instead of two disconnected data-entry points that could
          contradict each other. See RoomCategoryRows' showSelfContained. */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-bookingFee`}>Booking fee (%)</Label>
          <Input
            id={`${idPrefix}-bookingFee`}
            type="number"
            min={0}
            max={100}
            value={value.bookingFeePercent}
            onChange={(e) => onChange({ bookingFeePercent: e.target.value })}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-rentPeriod`}>Period for collecting rent</Label>
          <select
            id={`${idPrefix}-rentPeriod`}
            value={value.rentPeriod}
            onChange={(e) => onChange({ rentPeriod: e.target.value as RentPeriod | "" })}
            className={selectClass}
          >
            <option value="">Not specified</option>
            {RENT_PERIODS.map((r) => (
              <option key={r} value={r}>
                {RENT_PERIOD_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
        {value.rentPeriod === "other" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-rentPeriodOther`} required>
              Describe the rent period
            </Label>
            <Input
              id={`${idPrefix}-rentPeriodOther`}
              required
              value={value.rentPeriodOther}
              onChange={(e) => onChange({ rentPeriodOther: e.target.value })}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.transportShuttle}
            onChange={(e) => onChange({ transportShuttle: e.target.checked })}
          />
          University shuttle available
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.advanceRentRequired}
            onChange={(e) => onChange({ advanceRentRequired: e.target.checked })}
          />
          Advance rent required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={value.photographyConsent}
            onChange={(e) => onChange({ photographyConsent: e.target.checked })}
          />
          Permission to take pictures of the property
        </label>
      </div>

      {/* Furnishing and security used to be two separately-labeled sections
          ("Utilities included" / "Security measures") — folded into one
          "Amenities" box so CCTV, fencing, fire extinguishers etc. sit
          alongside furnishing instead of reading as unrelated form
          sections. Still two underlying fields (furnishingItems,
          securityFeatures) — only the presentation is merged. */}
      <div className="space-y-1.5">
        <Label>Amenities</Label>
        <div className="divide-y divide-border rounded-md border border-border">
          <CheckboxGrid
            options={UTILITY_OPTIONS}
            value={value.furnishingItems}
            onChange={(furnishingItems) => onChange({ furnishingItems })}
            bordered={false}
          />
          <CheckboxGrid
            options={SECURITY_FEATURE_OPTIONS}
            value={value.securityFeatures}
            onChange={(securityFeatures) => onChange({ securityFeatures })}
            bordered={false}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Accessibility</Label>
        <CheckboxGrid
          options={ACCESSIBILITY_FEATURE_OPTIONS}
          value={value.accessibilityFeatures}
          onChange={(accessibilityFeatures) => onChange({ accessibilityFeatures })}
        />
      </div>
    </div>
  );
}

/** Parses the string-backed numeric fields back to the shape the API
 * schemas expect (number | null), and folds "other" free text back to
 * `null` when a non-"other" option is selected. */
export function serializePropertyExtendedFields(v: PropertyExtendedFieldsValue) {
  return {
    alternativeName: v.alternativeName.trim() || null,
    locationDetails: v.locationDetails.trim() || null,
    genderArrangement: v.genderArrangement || null,
    otherCatchments: v.otherCatchments,
    authorityRole: v.authorityRole || undefined,
    authorityRoleOther: v.authorityRole === "other" ? v.authorityRoleOther.trim() || null : null,
    transportShuttle: v.transportShuttle,
    advanceRentRequired: v.advanceRentRequired,
    bookingFeePercent: v.bookingFeePercent === "" ? null : Number(v.bookingFeePercent),
    rentPeriod: v.rentPeriod || null,
    rentPeriodOther: v.rentPeriod === "other" ? v.rentPeriodOther.trim() || null : null,
    selfContainedRoomCount: v.selfContainedRoomCount === "" ? null : Number(v.selfContainedRoomCount),
    nonSelfContainedRoomCount:
      v.nonSelfContainedRoomCount === "" ? null : Number(v.nonSelfContainedRoomCount),
    furnishingItems: v.furnishingItems,
    securityFeatures: v.securityFeatures,
    accessibilityFeatures: v.accessibilityFeatures,
    photographyConsent: v.photographyConsent,
  };
}

/** Reverse of serializePropertyExtendedFields — hydrates the controlled form
 * state from an existing Property row (property-form-dialog's edit mode). */
export function propertyExtendedFieldsFromProperty(p: {
  alternativeName: string | null;
  locationDetails: string | null;
  genderArrangement: string | null;
  otherCatchments: string[];
  authorityRole: string | null;
  authorityRoleOther: string | null;
  transportShuttle: boolean;
  advanceRentRequired: boolean;
  bookingFeePercent: number | null;
  rentPeriod: string | null;
  rentPeriodOther: string | null;
  selfContainedRoomCount: number | null;
  nonSelfContainedRoomCount: number | null;
  furnishingItems: Record<string, boolean>;
  securityFeatures: Record<string, boolean>;
  accessibilityFeatures: Record<string, boolean>;
  photographyConsent: boolean;
}): PropertyExtendedFieldsValue {
  return {
    alternativeName: p.alternativeName ?? "",
    locationDetails: p.locationDetails ?? "",
    genderArrangement: (p.genderArrangement ?? "") as GenderArrangement | "",
    otherCatchments: p.otherCatchments ?? [],
    authorityRole: (p.authorityRole ?? "") as PropertyAuthorityRole | "",
    authorityRoleOther: p.authorityRoleOther ?? "",
    transportShuttle: p.transportShuttle,
    advanceRentRequired: p.advanceRentRequired,
    bookingFeePercent: p.bookingFeePercent == null ? "" : String(p.bookingFeePercent),
    rentPeriod: (p.rentPeriod ?? "") as RentPeriod | "",
    rentPeriodOther: p.rentPeriodOther ?? "",
    selfContainedRoomCount: p.selfContainedRoomCount == null ? "" : String(p.selfContainedRoomCount),
    nonSelfContainedRoomCount:
      p.nonSelfContainedRoomCount == null ? "" : String(p.nonSelfContainedRoomCount),
    furnishingItems: p.furnishingItems ?? {},
    securityFeatures: p.securityFeatures ?? {},
    accessibilityFeatures: p.accessibilityFeatures ?? {},
    photographyConsent: p.photographyConsent,
  };
}
