"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import type { TenantAgreementField, TenantAgreementFieldType, TenantAgreementTemplate } from "@campushomes/shared";
import { DEFAULT_TENANT_AGREEMENT_TEMPLATE_FIELDS, TENANT_AGREEMENT_FIELD_TYPES } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TenantAgreementFieldView, type TenantAgreementAnswerValue } from "@/components/tenant-agreement-field-view";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// Same duplicated-constant precedent as admin-export-panel.tsx's download
// flow — a raw fetch (not the api() wrapper) is needed here since the
// response is a PDF blob, not JSON.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

const FIELD_TYPE_LABEL: Record<TenantAgreementFieldType, string> = {
  heading: "Heading (section title — not fillable)",
  paragraph: "Paragraph (instructions, terms — not fillable)",
  fill_in: "Fill in the blank",
  multiple_choice: "Multiple choice (pick one)",
  checkboxes: "Checkboxes (pick any)",
};

const CHOICE_TYPES = new Set<TenantAgreementFieldType>(["multiple_choice", "checkboxes"]);
const STATIC_TYPES = new Set<TenantAgreementFieldType>(["heading", "paragraph"]);

type FieldRow = {
  key: string;
  fieldType: TenantAgreementFieldType;
  label: string;
  options: string[];
  required: boolean;
};

let nextKey = 0;
function emptyField(): FieldRow {
  nextKey += 1;
  return { key: `field-${nextKey}`, fieldType: "fill_in", label: "", options: [], required: false };
}

// Offered as the starting point for a property with no saved template yet —
// see DEFAULT_TENANT_AGREEMENT_TEMPLATE_FIELDS in shared for why these
// particular fields. Nothing is persisted until the landlord clicks save.
function defaultFieldRows(): FieldRow[] {
  return DEFAULT_TENANT_AGREEMENT_TEMPLATE_FIELDS.map((f) => {
    nextKey += 1;
    return {
      key: `field-${nextKey}`,
      fieldType: f.fieldType,
      label: f.label,
      options: f.options ?? [],
      required: f.required,
    };
  });
}

// Fields don't have a real id until they're saved — a preview needs
// something to key/group radio inputs by, so the row's own local key
// stands in. TenantAgreementField.id is a plain string at the type level
// (zod's uuid() only validates format at runtime), so this is type-safe.
function toPreviewField(row: FieldRow): TenantAgreementField {
  return {
    id: row.key,
    fieldType: row.fieldType,
    label: row.label.trim() || "(untitled)",
    options: CHOICE_TYPES.has(row.fieldType) ? row.options.map((o) => o.trim()).filter(Boolean) : null,
    required: row.required,
    position: 0,
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

const selectClass = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs transition-colors duration-150",
  "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
);

function FieldEditor({
  field,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  field: FieldRow;
  index: number;
  count: number;
  onChange: (patch: Partial<FieldRow>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const isChoice = CHOICE_TYPES.has(field.fieldType);
  const isStatic = STATIC_TYPES.has(field.fieldType);

  function updateOption(i: number, value: string) {
    onChange({ options: field.options.map((o, oi) => (oi === i ? value : o)) });
  }
  function removeOption(i: number) {
    onChange({ options: field.options.filter((_, oi) => oi !== i) });
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="flex shrink-0 flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move field up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            className="size-7"
          >
            <ChevronUp aria-hidden className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Move field down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            className="size-7"
          >
            <ChevronDown aria-hidden className="size-3.5" />
          </Button>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              aria-label="Field type"
              value={field.fieldType}
              onChange={(e) => {
                const fieldType = e.target.value as TenantAgreementFieldType;
                onChange({
                  fieldType,
                  options: CHOICE_TYPES.has(fieldType) ? (field.options.length ? field.options : ["", ""]) : [],
                  required: STATIC_TYPES.has(fieldType) ? false : field.required,
                });
              }}
              className={selectClass}
            >
              {TENANT_AGREEMENT_FIELD_TYPES.map((type) => (
                <option key={type} value={type}>
                  {FIELD_TYPE_LABEL[type]}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove field"
              onClick={onRemove}
              className="justify-self-end sm:justify-self-auto"
            >
              <Trash2 aria-hidden className="size-4" />
            </Button>
          </div>
          <Textarea
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={
              field.fieldType === "heading"
                ? "e.g. Welcome to Kikoni Court"
                : field.fieldType === "paragraph"
                  ? "Terms, house rules, or instructions…"
                  : "Question or field label"
            }
            rows={field.fieldType === "paragraph" ? 3 : 1}
          />
          {isChoice && (
            <div className="space-y-1.5 pl-1">
              {field.options.map((option, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{field.fieldType === "checkboxes" ? "☐" : "○"}</span>
                  <Input
                    value={option}
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove option"
                    disabled={field.options.length <= 2}
                    onClick={() => removeOption(i)}
                    className="size-8 shrink-0"
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ options: [...field.options, ""] })}
              >
                <Plus aria-hidden className="size-3.5" />
                Add option
              </Button>
            </div>
          )}
          {!isStatic && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="size-3.5 rounded border-input"
              />
              Required
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

/** Read-only-ish live preview — exactly the component the student form uses,
 * so "what you see is what they'll get". Answers are local-only and thrown
 * away; there's nowhere for them to go. */
function FieldsPreview({ title, fields }: { title: string; fields: FieldRow[] }) {
  const [answers, setAnswers] = useState<Record<string, TenantAgreementAnswerValue>>({});

  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">Add a field to see a preview.</p>;
  }

  return (
    <div className="space-y-5 rounded-md border border-border bg-muted/20 p-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase">
        Preview — this is what the student sees
      </p>
      <h1 className="font-display text-lg font-bold text-foreground">{title || "Tenant Agreement"}</h1>
      {fields.map((row) => {
        const field = toPreviewField(row);
        return (
          <TenantAgreementFieldView
            key={field.id}
            field={field}
            value={answers[field.id]}
            onChange={(value) => setAnswers((prev) => ({ ...prev, [field.id]: value }))}
          />
        );
      })}
    </div>
  );
}

function TenantAgreementBuilderBody({
  propertyId,
  onOpenChange,
}: {
  propertyId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("Tenant Agreement");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [hasSavedTemplate, setHasSavedTemplate] = useState(false);
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [pending, setPending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<TenantAgreementTemplate | null>(`/tenant-agreements/template/${propertyId}/edit`)
      .then((template) => {
        if (cancelled) return;
        if (template) {
          setTitle(template.title);
          setFields(
            template.fields.map((f) => ({
              key: `field-${f.id}`,
              fieldType: f.fieldType,
              label: f.label,
              options: f.options ?? [],
              required: f.required,
            })),
          );
          setHasSavedTemplate(true);
        } else {
          setFields(defaultFieldRows());
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 403) {
          // A real permission mismatch (not your property) — showing the
          // default fields here would invite editing a form the save call
          // will just reject, so leave the list empty instead.
          setError("You don't have permission to manage this property's tenant agreement.");
          return;
        }
        // Any other failure (network blip, 401, 500) shouldn't strand the
        // landlord on a blank dialog with no way to start — fall back to the
        // same starter template a property with no saved form would get.
        setFields(defaultFieldRows());
        setError("Couldn't check for a saved template, so you're seeing the starting template below.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  function updateField(key: string, patch: Partial<FieldRow>) {
    setFields((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }
  function removeField(key: string) {
    setFields((prev) => prev.filter((f) => f.key !== key));
  }
  function moveField(key: string, direction: -1 | 1) {
    setFields((prev) => {
      const index = prev.findIndex((f) => f.key === key);
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = prev.slice();
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  async function save() {
    setError(null);
    if (fields.length === 0) {
      setError("Add at least one field before saving.");
      return;
    }
    for (const field of fields) {
      if (!field.label.trim()) {
        setError("Every field needs text — fill in any empty ones.");
        return;
      }
      if (CHOICE_TYPES.has(field.fieldType) && field.options.filter((o) => o.trim()).length < 2) {
        setError("Multiple choice and checkbox fields need at least 2 options.");
        return;
      }
    }
    setPending(true);
    try {
      await api(`/tenant-agreements/template/${propertyId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: title.trim() || "Tenant Agreement",
          fields: fields.map((f) => ({
            fieldType: f.fieldType,
            label: f.label.trim(),
            options: CHOICE_TYPES.has(f.fieldType) ? f.options.map((o) => o.trim()).filter(Boolean) : undefined,
            required: f.required,
          })),
        }),
      });
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the template — try again."));
    } finally {
      setPending(false);
    }
  }

  // Downloads the last SAVED version (server-rendered PDF) — matches what's
  // actually live for students right now, not whatever unsaved edits are
  // sitting in the form. Same blob+anchor-click pattern as the admin
  // reports export panel.
  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/tenant-agreements/template/${propertyId}/pdf`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("download-failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "tenant-agreement"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't download the PDF — try again.");
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <>
      <DialogBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-lg border border-border bg-muted p-1">
            <button
              type="button"
              onClick={() => setView("edit")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                view === "edit" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              <Pencil aria-hidden className="size-3.5" />
              Edit
            </button>
            <button
              type="button"
              onClick={() => setView("preview")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                view === "preview" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              <Eye aria-hidden className="size-3.5" />
              Preview
            </button>
          </div>
          {hasSavedTemplate && (
            <Button type="button" variant="ghost" size="sm" disabled={downloading} onClick={downloadPdf}>
              <Download aria-hidden className="size-3.5" />
              {downloading ? "Preparing…" : "Download PDF"}
            </Button>
          )}
        </div>

        {view === "preview" ? (
          <FieldsPreview title={title} fields={fields} />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="template-title">Form title</Label>
              <Input id="template-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-3">
              {fields.map((field, i) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  index={i}
                  count={fields.length}
                  onChange={(patch) => updateField(field.key, patch)}
                  onRemove={() => removeField(field.key)}
                  onMove={(direction) => moveField(field.key, direction)}
                />
              ))}
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No fields yet — start with a heading or a paragraph of terms, then add fill-in fields,
                  multiple choice, or checkboxes for whatever you need the tenant to answer or agree to.
                </p>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={() => setFields((prev) => [...prev, emptyField()])}>
                <Plus aria-hidden className="size-4" />
                Add a field
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Every submission always includes a declaration of consent and ends with a signature (drawn or
              typed name) automatically — you don&apos;t need to add either of those here.
            </p>
          </>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save template"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function TenantAgreementBuilderDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" dismissible={false}>
      <DialogHeader
        title="Tenant agreement form"
        description={`Design the form students fill out when they scan ${propertyName}'s QR code.`}
        onClose={() => onOpenChange(false)}
      />
      {open && <TenantAgreementBuilderBody propertyId={propertyId} onOpenChange={onOpenChange} />}
    </Dialog>
  );
}
