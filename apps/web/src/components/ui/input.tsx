"use client";

import { cn } from "@/lib/utils";

function Input({ className, type, onWheel, onKeyDown, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive sm:h-10",
        type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
      inputMode={type === "number" ? "decimal" : undefined}
      onWheel={(event) => {
        if (type === "number") event.currentTarget.blur();
        onWheel?.(event);
      }}
      onKeyDown={(event) => {
        if (type === "number" && ["ArrowUp", "ArrowDown"].includes(event.key)) event.preventDefault();
        onKeyDown?.(event);
      }}
      {...props}
    />
  );
}

export { Input };
