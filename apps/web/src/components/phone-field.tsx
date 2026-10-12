"use client";

import { useState } from "react";
import { AFRICAN_COUNTRIES, normalizePhoneForCountry, type AfricanCountry } from "@campushomes/shared";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const UGANDA = AFRICAN_COUNTRIES.find((country) => country.iso2 === "UG")!;
const BY_DIAL_CODE_DESC = [...AFRICAN_COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

function detectCountry(e164: string): AfricanCountry {
  const digits = e164.replace(/[^\d]/g, "");
  return BY_DIAL_CODE_DESC.find((country) => digits.startsWith(country.dialCode)) ?? UGANDA;
}

function localPart(e164: string, country: AfricanCountry): string {
  return e164.startsWith(`+${country.dialCode}`) ? e164.slice(country.dialCode.length + 1) : e164.replace(/^\+/, "");
}

const fieldClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none transition-colors duration-150 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Lets a user pick any African country and enter a number in their own
 * local format — no single country's format is imposed on everyone.
 * `value`/`onChange` carry the canonical E.164 string; use `key={...}` from
 * the caller to reset country/local state when the underlying record changes.
 */
export function PhoneField({
  id,
  label,
  required,
  value,
  onChange,
  className,
  placeholder,
  hint,
  labelClassName,
  hintClassName,
}: {
  id?: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Defaults to the selected country's example number. */
  placeholder?: string;
  /** Defaults to "e.g. +<dial code> <example>". */
  hint?: string;
  labelClassName?: string;
  hintClassName?: string;
}) {
  const [country, setCountry] = useState<AfricanCountry>(() => detectCountry(value || `+${UGANDA.dialCode}`));
  const [local, setLocal] = useState(() => localPart(value, country));

  function commit(nextCountry: AfricanCountry, nextLocal: string) {
    onChange(nextLocal.trim() ? normalizePhoneForCountry(nextCountry.dialCode, nextLocal) : "");
  }

  return (
    <label className={cn("block", className)} htmlFor={id}>
      <span className={cn("mb-1.5 block text-xs font-bold text-foreground", labelClassName)}>
        {label}
        {required && <span aria-hidden className="ml-0.5 text-red-600">*</span>}
      </span>
      <div className="flex gap-2">
        <select
          aria-label={`${label} country`}
          className={cn(fieldClass, "h-11 w-[9.5rem] shrink-0 sm:h-10")}
          value={country.iso2}
          onChange={(event) => {
            const next = AFRICAN_COUNTRIES.find((c) => c.iso2 === event.target.value) ?? UGANDA;
            setCountry(next);
            commit(next, local);
          }}
        >
          {AFRICAN_COUNTRIES.map((c) => (
            <option key={c.iso2} value={c.iso2}>
              {c.name} (+{c.dialCode})
            </option>
          ))}
        </select>
        {/* Commit on every keystroke, not on blur: pressing Enter submits the
            form without a blur, which used to send an empty number. */}
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          required={required}
          placeholder={placeholder ?? country.example}
          value={local}
          onChange={(event) => {
            setLocal(event.target.value);
            commit(country, event.target.value);
          }}
        />
      </div>
      <span className={cn("mt-1 block text-[10px] text-muted-foreground", hintClassName)}>
        {hint ?? `e.g. +${country.dialCode} ${country.example}`}
      </span>
    </label>
  );
}
