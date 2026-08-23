"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  STATIC_TENANT_AGREEMENT_FIELD_TYPES,
  TENANT_AGREEMENT_DECLARATION_TEXT,
  type TenantAgreementTemplate,
} from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import { TenantAgreementFieldView, type TenantAgreementAnswerValue } from "@/components/tenant-agreement-field-view";
import { api, apiErrorMessage } from "@/lib/api";
import { uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

type Signature = { type: "typed"; signedName: string } | { type: "drawn"; signatureStorageKey: string };

export function TenantAgreementForm({
  propertyId,
  template,
}: {
  propertyId: string;
  template: TenantAgreementTemplate;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, TenantAgreementAnswerValue>>({});
  // Drawing is the default — most students scanning a QR posted at the
  // property are on a phone. Typing the name is the explicit fallback for
  // when drawing isn't practical.
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [signatureMode, setSignatureMode] = useState<"drawn" | "typed">("drawn");
  const [signedName, setSignedName] = useState("");
  const signaturePadRef = useRef<SignaturePadHandle>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(fieldId: string, value: TenantAgreementAnswerValue) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    for (const field of template.fields) {
      if (!field.required || STATIC_TENANT_AGREEMENT_FIELD_TYPES.has(field.fieldType)) continue;
      const value = answers[field.id];
      const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value && value.trim());
      if (!hasValue) {
        setError(`"${field.label}" is required.`);
        return;
      }
    }
    if (!declarationAccepted) {
      setError("You must accept the declaration to submit.");
      return;
    }
    if (signatureMode === "typed" && signedName.trim().length < 2) {
      setError("Type your full name to sign.");
      return;
    }
    if (signatureMode === "drawn" && (signaturePadRef.current?.isEmpty() ?? true)) {
      setError("Draw your signature, or switch to typing your name instead.");
      return;
    }

    setPending(true);
    try {
      let signature: Signature;
      if (signatureMode === "typed") {
        signature = { type: "typed", signedName: signedName.trim() };
      } else {
        const blob = await signaturePadRef.current?.toBlob();
        if (!blob) throw new Error("Couldn't capture your signature — try again.");
        const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
        const file = new File([blob], "signature.png", { type: "image/png" });
        const { publicId } = await uploadToCloudinary(file, sig);
        signature = { type: "drawn", signatureStorageKey: publicId };
      }

      await api("/tenant-agreements", {
        method: "POST",
        body: JSON.stringify({
          propertyId,
          responses: template.fields
            .filter((f) => !STATIC_TENANT_AGREEMENT_FIELD_TYPES.has(f.fieldType) && answers[f.id] !== undefined)
            .map((f) => ({ fieldId: f.id, value: answers[f.id] })),
          declarationAccepted: true,
          signature,
        }),
      });
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't submit your tenant agreement — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {template.fields.map((field) => (
        <TenantAgreementFieldView
          key={field.id}
          field={field}
          value={answers[field.id]}
          onChange={(value) => setAnswer(field.id, value)}
        />
      ))}

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground">Declaration</p>
        <label className="flex items-start gap-2.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={declarationAccepted}
            onChange={(e) => setDeclarationAccepted(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-input"
          />
          <span>
            {TENANT_AGREEMENT_DECLARATION_TEXT}
            <span className="ml-0.5 text-destructive">*</span>
          </span>
        </label>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-semibold text-foreground">Sign to finish</p>
        <div className="flex rounded-lg border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setSignatureMode("drawn")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              signatureMode === "drawn" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            Draw signature
          </button>
          <button
            type="button"
            onClick={() => setSignatureMode("typed")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
              signatureMode === "typed" ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            Type my name instead
          </button>
        </div>
        {signatureMode === "drawn" ? (
          <div className="space-y-2">
            <SignaturePad ref={signaturePadRef} />
            <Button type="button" variant="ghost" size="sm" onClick={() => signaturePadRef.current?.clear()}>
              Clear
            </Button>
          </div>
        ) : (
          <Input
            value={signedName}
            onChange={(e) => setSignedName(e.target.value)}
            placeholder="Your full legal name"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Sign tenant agreement"}
      </Button>
    </form>
  );
}
