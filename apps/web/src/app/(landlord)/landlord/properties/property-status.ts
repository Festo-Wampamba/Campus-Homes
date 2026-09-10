export type PropertyStatusTone = "success" | "warning" | "destructive";

const PROPERTY_STATUS: Record<string, { label: string; tone: PropertyStatusTone }> = {
  active: { label: "Active", tone: "success" },
  pending_kyc: { label: "Pending verification", tone: "warning" },
  suspended: { label: "Suspended", tone: "destructive" },
};

export function propertyStatusPresentation(status: string) {
  return PROPERTY_STATUS[status] ?? {
    label: status.replaceAll("_", " "),
    tone: "warning" as const,
  };
}
