"use client";

import type { TenantAgreementField } from "@campushomes/shared";

import { Textarea } from "@/components/ui/textarea";

export type TenantAgreementAnswerValue = string | string[];

/** One field, rendered exactly the same way in the real student-facing form
 * (apps/web/src/app/agreement/[propertyId]/tenant-agreement-form.tsx) and
 * the builder's live preview — a single source of truth for "what does this
 * field type look like", so the two can never quietly drift apart. */
export function TenantAgreementFieldView({
  field,
  value,
  onChange,
  disabled,
}: {
  field: TenantAgreementField;
  value: TenantAgreementAnswerValue | undefined;
  onChange: (value: TenantAgreementAnswerValue) => void;
  disabled?: boolean;
}) {
  if (field.fieldType === "heading") {
    return <h2 className="font-display text-lg font-bold text-foreground">{field.label}</h2>;
  }
  if (field.fieldType === "paragraph") {
    return <p className="whitespace-pre-wrap text-sm text-muted-foreground">{field.label}</p>;
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-foreground">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {field.fieldType === "fill_in" && (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={2}
        />
      )}
      {field.fieldType === "multiple_choice" && (
        <div className="space-y-1.5">
          {field.options?.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name={field.id}
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                disabled={disabled}
                className="size-4"
              />
              {option}
            </label>
          ))}
        </div>
      )}
      {field.fieldType === "checkboxes" && (
        <div className="space-y-1.5">
          {field.options?.map((option) => {
            const current = Array.isArray(value) ? value : [];
            return (
              <label key={option} className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={current.includes(option)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...current, option] : current.filter((o) => o !== option))
                  }
                  disabled={disabled}
                  className="size-4 rounded border-input"
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
