"use client";

import { EyeClosedIcon, EyeOpenIcon } from "@radix-ui/react-icons";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

import { Input } from "./input";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  wrapperClassName?: string;
};

function PasswordInput({
  className,
  disabled,
  id,
  wrapperClassName,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [isVisible, setIsVisible] = useState(false);
  const actionLabel = isVisible ? "Hide password" : "Show password";
  const VisibilityIcon = isVisible ? EyeClosedIcon : EyeOpenIcon;

  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input
        {...props}
        id={inputId}
        type={isVisible ? "text" : "password"}
        disabled={disabled}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        aria-controls={inputId}
        aria-label={actionLabel}
        aria-pressed={isVisible}
        title={actionLabel}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setIsVisible((visible) => !visible)}
        className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50"
      >
        <VisibilityIcon aria-hidden width={17} height={17} />
      </button>
    </div>
  );
}

export { PasswordInput };
