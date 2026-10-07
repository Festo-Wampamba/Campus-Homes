import {
  Activity,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  ClipboardCheck,
  FileBarChart,
  MessageSquare,
  Settings,
  ShieldCheck,
  UserCog,
  type LucideIcon,
} from "lucide-react";

export type AuditTone = "positive" | "negative" | "neutral";

const PAST: Record<string, string> = {
  accept: "accepted", add: "added", approve: "approved", archive: "archived", assign: "assigned",
  block: "blocked", book: "booked", cancel: "cancelled", confirm: "confirmed", create: "created",
  deactivate: "deactivated", delete: "deleted", export: "exported", forward: "forwarded",
  grant: "granted", invite: "invited", publish: "published", purge: "purged", raise: "raised",
  reject: "rejected", release: "released", remove: "removed", request: "requested",
  reserve: "reserved", resolve: "resolved", revoke: "revoked", schedule: "scheduled",
  strike: "strike issued", submit: "submitted", suspend: "suspended", sync: "synced",
  unblock: "unblocked", update: "updated",
};

// Plural API resource names read better singular in a one-line event.
const SINGULAR: Record<string, string> = {
  inquiries: "inquiry", integrations: "integration", landlords: "landlord", listings: "listing",
  properties: "property", reports: "report", roles: "role", semesters: "semester", units: "unit",
  users: "user", visits: "visit",
};

const OVERRIDES: Record<string, string> = {
  "landlord.kyc_decision": "Landlord KYC decision recorded",
  "reports.publish_powerbi": "Report published to Power BI",
};

const NEGATIVE = new Set(["cancel", "deactivate", "delete", "purge", "reject", "rejected", "revoke", "strike", "suspend"]);
const POSITIVE = new Set(["accept", "approve", "approved", "confirm", "publish", "resolve"]);

/** Turns an audit key such as `landlord_account.approve` into "Landlord account approved". */
export function describeAuditAction(action: string): { text: string; verb: string } {
  const parts = action.split(".");
  const verbPart = parts.pop() ?? "";
  const subject = parts.flatMap((p) => p.split("_")).map((w, i) => (i === 0 ? SINGULAR[w] ?? w : w));
  const verbWords = verbPart.split("_");
  const verb = verbWords.pop() ?? "";
  const text = OVERRIDES[action] ?? [...subject, ...verbWords, PAST[verb] ?? verb].filter(Boolean).join(" ");
  return { text: text.charAt(0).toUpperCase() + text.slice(1), verb };
}

export function auditTone(action: string): AuditTone {
  const { verb } = describeAuditAction(action);
  return NEGATIVE.has(verb) ? "negative" : POSITIVE.has(verb) ? "positive" : "neutral";
}

export function auditIcon(action: string): LucideIcon {
  const subject = action.split(".")[0];
  if (subject.startsWith("landlord")) return BadgeCheck;
  if (subject === "users") return UserCog;
  if (subject === "roles" || subject === "staff") return ShieldCheck;
  if (/^(listing|propert|room|unit)/.test(subject)) return Building2;
  if (/^(visit|lead)/.test(subject)) return ClipboardCheck;
  if (subject === "reservation" || subject === "move_in") return CalendarCheck2;
  if (subject.startsWith("inquir")) return MessageSquare;
  if (["settings", "integrations", "semesters"].includes(subject)) return Settings;
  if (subject === "reports") return FileBarChart;
  return Activity;
}
