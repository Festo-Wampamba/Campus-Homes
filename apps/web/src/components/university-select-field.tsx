"use client";

import { UNIVERSITIES, type University } from "@campushomes/shared";

import { cn } from "@/lib/utils";

export const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University (MUK)",
  MUBS: "Makerere University Business School (MUBS)",
  KIU: "Kampala International University (KIU)",
  KYU: "Kyambogo University (KYU)",
  other: "Other",
};

export function UniversitySelectField({
  value,
  onChange,
  autoFocus,
}: {
  value: University | "";
  onChange: (value: University) => void;
  autoFocus?: boolean;
}) {
  return (
    <select
      required
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value as University)}
      className={cn(
        "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
        "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      )}
    >
      <option value="" disabled>
        Select your university
      </option>
      {UNIVERSITIES.map((id) => (
        <option key={id} value={id}>
          {UNIVERSITY_LABELS[id]}
        </option>
      ))}
    </select>
  );
}
