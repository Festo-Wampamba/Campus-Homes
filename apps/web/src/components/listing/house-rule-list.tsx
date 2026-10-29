import type { ComponentType } from "react";
import {
  Banknote,
  Baby,
  Bath,
  BedDouble,
  BrushCleaning,
  ChefHat,
  Cigarette,
  ClipboardList,
  Clock3,
  CookingPot,
  Droplets,
  KeyRound,
  PawPrint,
  ShieldCheck,
  Syringe,
  UsersRound,
  Volume2,
  Wine,
  Wrench,
} from "lucide-react";

type Glyph = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type HouseRuleIcon = {
  // One glyph, or two drawn side by side (alcohol + drugs).
  glyphs: Glyph[];
  // Red "not allowed" ring and slash over the glyphs.
  prohibited: boolean;
  // Small corner glyph, e.g. a clock on a time-limited rule.
  badge?: Glyph;
};

/** Gate with a padlock, drawn in lucide's stroke style (lucide has no gate). */
export function GateLock({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 21V5M21 21V5" />
      <path d="M3 8c4-3.5 14-3.5 18 0" />
      <path d="M7 6.6V21M17 6.6V21M12 5.9v4.6M12 17.5V21" />
      <rect x="9.25" y="12.5" width="5.5" height="5" rx="1" />
      <path d="M10.5 12.5v-1a1.5 1.5 0 0 1 3 0v1" />
    </svg>
  );
}

const PROHIBITED = /^\s*no\b|not allowed|prohibited|forbidden|banned/;

/** Pick an icon from the rule's own wording. The rule text is rendered
 * verbatim below, so this helper never creates a rule the landlord did not
 * supply. */
export function houseRuleIcon(rule: string): HouseRuleIcon {
  const value = rule.toLocaleLowerCase();
  const prohibited = PROHIBITED.test(value);
  const icon = (glyphs: Glyph | Glyph[], badge?: Glyph): HouseRuleIcon => ({
    glyphs: Array.isArray(glyphs) ? glyphs : [glyphs],
    prohibited,
    ...(badge ? { badge } : {}),
  });
  if (/overnight|sleep ?over/.test(value)) return icon(BedDouble);
  if (/(guest|visitor).*(leave|until|before|\d\s*(am|pm))/.test(value)) return icon(UsersRound, Clock3);
  if (/gate/.test(value)) return icon(GateLock);
  if (/noise|quiet|music|sound/.test(value)) return icon(Volume2);
  if (/smok|cigarette|tobacco|vape/.test(value)) return icon(Cigarette);
  if (/\b(alcohol|liquor|beer|drugs?|substances?)\b/.test(value)) return icon([Wine, Syringe]);
  if (/\b(pets?|animals?|dogs?|cats?)\b/.test(value)) return icon(PawPrint);
  if (/guest|visitor|occup|gender|\b(wo)?men\b|\b(fe)?males?\b/.test(value)) return icon(UsersRound);
  if (/child|children|baby|minor/.test(value)) return icon(Baby);
  if (/clean|hygiene|litter|waste|trash/.test(value)) return icon(BrushCleaning);
  if (/bath|shower|toilet|wash/.test(value)) return icon(Bath);
  if (/cook/.test(value)) return icon(CookingPot);
  if (/kitchen|food|meal/.test(value)) return icon(ChefHat);
  if (/damage|repair|broken|fault/.test(value)) return icon(Wrench);
  if (/water/.test(value)) return icon(Droplets);
  if (/pay|rent|deposit|fee|charge/.test(value)) return icon(Banknote);
  if (/key|access|entry|door|lock|security/.test(value)) return icon(KeyRound);
  if (/curfew|time|hour/.test(value)) return icon(Clock3);
  if (/safe|safety|emergency/.test(value)) return icon(ShieldCheck);
  return { glyphs: [ClipboardList], prohibited: false };
}

function RuleIcon({ icon: { glyphs, prohibited, badge: Badge } }: { icon: HouseRuleIcon }) {
  const pair = glyphs.length > 1;
  const glyphSize = pair ? "size-4" : "size-5";
  return (
    <span className="relative grid size-11 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
      <span className="flex items-center">
        {glyphs.map((Glyph, i) => (
          <Glyph key={i} aria-hidden className={glyphSize} />
        ))}
      </span>
      {prohibited && (
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          className="absolute inset-0.5 text-destructive"
        >
          <circle cx="12" cy="12" r="11" />
          <path d="M4.2 4.2l15.6 15.6" />
        </svg>
      )}
      {Badge && (
        <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full border border-border bg-card text-teal-700">
          <Badge aria-hidden className="size-3" />
        </span>
      )}
    </span>
  );
}

export function HouseRuleList({ rules }: { rules: string[] }) {
  const visibleRules = rules.map((rule) => rule.trim()).filter(Boolean);
  if (visibleRules.length === 0) return null;

  return (
    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
      {visibleRules.map((rule, index) => (
        <li
          key={`${rule}-${index}`}
          className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground"
        >
          <RuleIcon icon={houseRuleIcon(rule)} />
          <span className="min-w-0">{rule}</span>
        </li>
      ))}
    </ul>
  );
}
