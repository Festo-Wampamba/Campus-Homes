import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-base font-semibold transition-colors duration-150 ease-out-quart focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:bg-teal-700 active:bg-teal-900",
        secondary:
          "border border-border bg-background text-foreground shadow-xs hover:bg-muted active:bg-accent",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        ghost: "text-foreground hover:bg-muted active:bg-accent",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // 44px touch floor on mobile (PRODUCT.md accessibility), 40px ≥sm
        default: "h-11 px-4 sm:h-10",
        sm: "h-9 rounded-md px-3 text-sm",
        lg: "h-12 rounded-md px-6",
        icon: "size-11 sm:size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
