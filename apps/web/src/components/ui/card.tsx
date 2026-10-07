import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-xs",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-header" className={cn("flex flex-col gap-1 p-4 sm:p-5", className)} {...props} />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return <h3 className={cn("text-lg leading-snug", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...props} />
  );
}

// Content directly under a CardHeader drops its top padding (the header
// already provides it); standalone content keeps padding on every side. The
// old unconditional `sm:pt-0` survived a caller's `p-4`, so every standalone
// card lost its top padding on desktop.
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4 sm:p-5 [[data-slot=card-header]+&]:pt-0", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
