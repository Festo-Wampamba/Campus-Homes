import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Shared status vocabulary across all three portals (PRODUCT.md principle 4):
 * tinted background + solid ink + icon — never color-only, never icon-only.
 * Solid teal fill stays reserved for VerifiedBadge.
 */
const statusChipVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold",
  {
    variants: {
      tone: {
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        destructive: "bg-destructive-subtle text-destructive",
        neutral: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

const toneIcons: Record<string, LucideIcon> = {
  success: CheckCircle2,
  warning: Clock,
  destructive: AlertCircle,
  neutral: CircleDashed,
};

function StatusChip({
  className,
  tone,
  icon,
  children,
}: React.ComponentProps<"span"> &
  VariantProps<typeof statusChipVariants> & { icon?: LucideIcon }) {
  const Icon = icon ?? toneIcons[tone ?? "neutral"];
  return (
    <span className={cn(statusChipVariants({ tone, className }))}>
      <Icon aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

export { StatusChip, statusChipVariants };
