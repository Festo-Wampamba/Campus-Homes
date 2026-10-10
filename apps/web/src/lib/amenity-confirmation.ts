import {
  ACCESSIBILITY_FEATURE_OPTIONS,
  AMENITY_OPTIONS,
  humanizeKey,
  SECURITY_FEATURE_OPTIONS,
  UTILITY_OPTIONS,
} from "@/lib/format";

type Checklist = Record<string, boolean> | null | undefined;

export type DeclaredChecklists = {
  proposedAmenities: Checklist;
  furnishingItems: Checklist;
  securityFeatures: Checklist;
  accessibilityFeatures: Checklist;
};

type Option = { key: string; label: string };

export type AmenityGroup = {
  title: string;
  /** What the landlord ticked (custom items included), for Ops to confirm. */
  declared: Option[];
  /** Everything else in this group, in case the inspection found more. */
  others: Option[];
};

const GROUPS: Array<{ title: string; source: keyof DeclaredChecklists; options: Option[] }> = [
  { title: "Amenities", source: "proposedAmenities", options: AMENITY_OPTIONS },
  { title: "Furnishing", source: "furnishingItems", options: UTILITY_OPTIONS },
  { title: "Safety", source: "securityFeatures", options: SECURITY_FEATURE_OPTIONS },
  { title: "Accessibility", source: "accessibilityFeatures", options: ACCESSIBILITY_FEATURE_OPTIONS },
];

/** The landlord's four onboarding checklists, regrouped for the Ops publish
 * form. A key listed in more than one group (security_guard) shows once:
 * declared wherever the landlord ticked it, otherwise in its first group. */
export function amenityGroups(property: DeclaredChecklists | null): AmenityGroup[] {
  const shown = new Set<string>();
  const declaredByGroup = GROUPS.map(({ source, options }) => {
    const record = property?.[source] ?? {};
    const labels = new Map(options.map((o) => [o.key, o.label]));
    const declared = Object.keys(record)
      .filter((key) => record[key] && !shown.has(key))
      .map((key) => ({ key, label: labels.get(key) ?? humanizeKey(key) }));
    declared.forEach((o) => shown.add(o.key));
    return declared;
  });
  return GROUPS.map(({ title, options }, i) => {
    const others = options.filter((o) => !shown.has(o.key));
    others.forEach((o) => shown.add(o.key));
    return { title, declared: declaredByGroup[i], others };
  });
}

/** Initial checkbox state for a first publish: everything the landlord
 * declared starts ticked, so Ops only unticks what the visit didn't confirm. */
export function declaredAmenityState(property: DeclaredChecklists | null): Record<string, boolean> {
  return Object.fromEntries(
    amenityGroups(property).flatMap((g) => g.declared.map((o) => [o.key, true] as const)),
  );
}
