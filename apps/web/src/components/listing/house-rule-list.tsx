import {
  Banknote,
  Baby,
  Bath,
  ChefHat,
  Cigarette,
  ClipboardList,
  Clock3,
  Droplets,
  KeyRound,
  PawPrint,
  ShieldCheck,
  SprayCan,
  UsersRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";

import { FeatureIcon } from "@/components/listing/feature-icon";

/** Pick an icon from the rule's own wording. The rule text is rendered
 * verbatim below, so this helper never creates a rule the landlord did not
 * supply. */
export function houseRuleIcon(rule: string): LucideIcon {
  const value = rule.toLocaleLowerCase();
  if (/noise|quiet|music|sound/.test(value)) return Volume2;
  if (/smok|cigarette|tobacco|vape/.test(value)) return Cigarette;
  if (/pet|animal|dog|cat/.test(value)) return PawPrint;
  if (/guest|visitor|occup|gender|women|men|female|male/.test(value)) return UsersRound;
  if (/child|children|baby|minor/.test(value)) return Baby;
  if (/clean|hygiene|litter|waste|trash/.test(value)) return SprayCan;
  if (/bath|shower|toilet|wash/.test(value)) return Bath;
  if (/cook|kitchen|food|meal/.test(value)) return ChefHat;
  if (/water/.test(value)) return Droplets;
  if (/pay|rent|deposit|fee|charge/.test(value)) return Banknote;
  if (/key|access|entry|door|lock|security/.test(value)) return KeyRound;
  if (/curfew|time|hour|quiet hour/.test(value)) return Clock3;
  if (/safe|safety|emergency/.test(value)) return ShieldCheck;
  return ClipboardList;
}

export function HouseRuleList({ rules }: { rules: string[] }) {
  const visibleRules = rules.map((rule) => rule.trim()).filter(Boolean);
  if (visibleRules.length === 0) return null;

  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {visibleRules.map((rule, index) => (
        <li key={`${rule}-${index}`} className="rounded-xl border border-border bg-card px-3 py-2.5">
          <FeatureIcon icon={houseRuleIcon(rule)} label={rule} className="text-foreground" />
        </li>
      ))}
    </ul>
  );
}
