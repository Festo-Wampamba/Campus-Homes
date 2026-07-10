import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Empty states teach the interface, not "nothing here" (DESIGN.md). */
function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-12 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
        <Icon aria-hidden className="size-5" />
      </span>
      <h2 className="mt-4 text-lg">{title}</h2>
      <p className="mt-1.5 max-w-sm text-base text-muted-foreground">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export { EmptyState };
