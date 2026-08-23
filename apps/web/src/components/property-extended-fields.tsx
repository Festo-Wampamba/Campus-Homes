"use client";

import {
  GENDER_ARRANGEMENTS,
  PROPERTY_AUTHORITY_ROLES,
  RENT_PERIODS,
  UNIVERSITIES,
  type GenderArrangement,
  type PropertyAuthorityRole,
  type RentPeriod,
  type University,
} from "@campushomes/shared";

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

const UNIVERSITY_LABELS: Record<string, string> = {
  MUK: "Makerere University",
  MUBS: "Makerere University Business School",
  KIU: "Kampala International University",
  KYU: "Kyambogo University",
  other: "Other / not listed",
};

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
  otherCatchments: University[];
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
}: {
  options: { key: string; label: string }[];
  value: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-3">
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
  const otherCatchmentOptions = UNIVERSITIES.filter((u) => u !== "other");

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
        <Label>Other universities served</Label>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-4">
          {otherCatchmentOptions.map((u) => (
            <label key={u} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.otherCatchments.includes(u)}
                onChange={(e) =>
                  onChange({
                    otherCatchments: e.target.checked
                      ? [...value.otherCatchments, u]
                      : value.otherCatchments.filter((x) => x !== u),
                  })
                }
              />
              {UNIVERSITY_LABELS[u] ?? u}
            </label>
          ))}
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

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-selfContained`}>Self-contained rooms</Label>
          <Input
            id={`${idPrefix}-selfContained`}
            type="number"
            min={0}
            value={value.selfContainedRoomCount}
            onChange={(e) => onChange({ selfContainedRoomCount: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-nonSelfContained`}>Non-self-contained rooms</Label>
          <Input
            id={`${idPrefix}-nonSelfContained`}
            type="number"
            min={0}
            value={value.nonSelfContainedRoomCount}
            onChange={(e) => onChange({ nonSelfContainedRoomCount: e.target.value })}
          />
        </div>
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

      <div className="space-y-1.5">
        <Label>Utilities included</Label>
        <CheckboxGrid
          options={UTILITY_OPTIONS}
          value={value.furnishingItems}
          onChange={(furnishingItems) => onChange({ furnishingItems })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Security measures</Label>
        <CheckboxGrid
          options={SECURITY_FEATURE_OPTIONS}
          value={value.securityFeatures}
          onChange={(securityFeatures) => onChange({ securityFeatures })}
        />
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
    otherCatchments: (p.otherCatchments ?? []) as University[],
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
