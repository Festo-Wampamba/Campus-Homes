"use client";

import { LANDLORD_BUSINESS_TYPES, type LandlordBusinessType } from "@campushomes/shared";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LANDLORD_BUSINESS_TYPE_LABELS } from "@/lib/format";
import { cn } from "@/lib/utils";

const selectClass = cn(
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
);

/** Landlord & Property Registration Form parity (0025) — the
 * Landlord/Caretaker Information section. Shared between the onboarding
 * wizard's legal-name step and anywhere else a landlord's own identity is
 * captured/edited (self-serve or Ops-assisted). Deliberately no Identity
 * Verification fields (doc type/number) — landlords are never asked to
 * submit an identity document (privacy decision, product call). */
export type LandlordIdentityFieldsValue = {
  whatsappNumber: string;
  businessType: LandlordBusinessType;
  businessTypeOther: string;
};

export function emptyLandlordIdentityFields(): LandlordIdentityFieldsValue {
  return {
    whatsappNumber: "",
    businessType: "individual_landlord",
    businessTypeOther: "",
  };
}

export function LandlordIdentityFields({
  value,
  onChange,
  idPrefix,
}: {
  value: LandlordIdentityFieldsValue;
  onChange: (patch: Partial<LandlordIdentityFieldsValue>) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-whatsapp`}>WhatsApp number</Label>
        <Input
          id={`${idPrefix}-whatsapp`}
          value={value.whatsappNumber}
          onChange={(e) => onChange({ whatsappNumber: e.target.value })}
          placeholder="+256…"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-businessType`} required>
            How do you operate this accommodation?
          </Label>
          <select
            id={`${idPrefix}-businessType`}
            required
            value={value.businessType}
            onChange={(e) => onChange({ businessType: e.target.value as LandlordBusinessType })}
            className={selectClass}
          >
            {LANDLORD_BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {LANDLORD_BUSINESS_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {value.businessType === "other" && (
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-businessTypeOther`} required>
              Describe the business type
            </Label>
            <Input
              id={`${idPrefix}-businessTypeOther`}
              required
              value={value.businessTypeOther}
              onChange={(e) => onChange({ businessTypeOther: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
