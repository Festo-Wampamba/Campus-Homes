import Image from "next/image";

import { cn } from "@/lib/utils";

// Teal artwork for light surfaces, white artwork for dark ones. Both render and
// CSS shows one, so switching the theme never waits on a fetch or a re-render.
// `onDark` forces the white artwork for surfaces that are dark in both themes
// (hero photos, the footer).
function ThemedImage({
  light,
  dark,
  width,
  height,
  alt,
  onDark,
  className,
}: {
  light: string;
  dark: string;
  width: number;
  height: number;
  alt: string;
  onDark: boolean;
  className?: string;
}) {
  if (onDark) {
    return <Image src={dark} alt={alt} width={width} height={height} className={className} />;
  }
  return (
    <>
      <Image src={light} alt={alt} width={width} height={height} className={cn(className, "dark:hidden")} />
      <Image src={dark} alt={alt} width={width} height={height} className={cn(className, "hidden dark:block")} />
    </>
  );
}

function Wordmark({
  className,
  onDark = false,
  stacked = false,
}: {
  className?: string;
  onDark?: boolean;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <span className={cn("inline-flex flex-col items-center gap-1.5", className)}>
        <ThemedImage
          light="/images/branding/campushomes-icon-light.png"
          dark="/images/branding/campushomes-icon-dark.png"
          width={512}
          height={512}
          alt=""
          onDark={onDark}
          className="h-12 w-auto"
        />
        <span
          className={cn(
            "font-brand text-xl tracking-tight",
            onDark ? "text-white" : "text-teal-700 dark:text-white",
          )}
        >
          CampusHomes
        </span>
        <span
          className={cn(
            "font-brand-script text-lg",
            // coral-500 is ~2.5:1 on white — too light for 11px text (WCAG AA
            // needs 4.5:1); darkened here only, coral-500 stays for onDark.
            onDark ? "text-coral-500" : "text-[oklch(0.57_0.13_22)] dark:text-coral-500",
          )}
        >
          Live, Learn, Succeed
        </span>
      </span>
    );
  }

  // Height in em so callers keep sizing the logo with text-* classes.
  return (
    <span className={cn("inline-flex items-center text-lg", className)}>
      <ThemedImage
        light="/images/branding/campushomes-logo-light.png"
        dark="/images/branding/campushomes-logo-dark.png"
        width={867}
        height={200}
        alt="CampusHomes"
        onDark={onDark}
        className="h-[1.75em] w-auto max-w-full"
      />
    </span>
  );
}

export { Wordmark };
