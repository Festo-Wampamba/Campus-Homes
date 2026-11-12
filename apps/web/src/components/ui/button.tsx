import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 min-w-0 max-w-full whitespace-normal break-words rounded-md text-base font-semibold transition-colors duration-150 ease-out-quart focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
        // Minimum touch height; multiline labels can grow without clipping.
        default: "h-auto min-h-11 px-4 py-2",
        sm: "h-auto min-h-9 rounded-md px-3 py-2 text-sm",
        xs: "h-7 min-h-0 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap [@media(pointer:coarse)]:min-h-9",
        lg: "h-auto min-h-12 rounded-md px-6 py-3",
        icon: "size-[44px] shrink-0",
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
