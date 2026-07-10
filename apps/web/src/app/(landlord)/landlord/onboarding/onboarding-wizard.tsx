"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DOC_TYPES, type DocType, type LandlordProfile, type Property } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

type Step = "legal" | "id-doc" | "property";

const DOC_LABELS: Record<DocType, string> = {
  title_deed: "Title deed",
  tenancy: "Tenancy agreement",
  authorization: "Landlord authorization letter",
  other: "Other supporting document",
};

const STEP_INDEX: Record<Step, number> = { legal: 1, "id-doc": 2, property: 3 };

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

function StepHeader({ step, title, description }: { step: Step; title: string; description: string }) {
  return (
    <div className="mb-6">
      <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Step {STEP_INDEX[step]} of 3
      </p>
      <h1 className="mb-1 font-display text-lg font-bold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function OnboardingWizard({
  initialProfile,
  initialStep,
}: {
  initialProfile: LandlordProfile | null;
  initialStep: Step;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initialStep);
  const [legalName, setLegalName] = useState(initialProfile?.legalName ?? "");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [propertyName, setPropertyName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [docType, setDocType] = useState<DocType>("title_deed");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitLegalName(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/landlords/profile", {
        method: "POST",
        body: JSON.stringify({ legalName }),
      });
      setStep("id-doc");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your legal name — try again."));
    } finally {
      setPending(false);
    }
  }

  async function submitIdDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!idFile) return;
    setError(null);
    setPending(true);
    try {
      const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      const { publicId } = await uploadToCloudinary(idFile, sig);
      await api("/landlords/profile", {
        method: "POST",
        body: JSON.stringify({ legalName, idDocStorageKey: publicId }),
      });
      setStep("property");
    } catch (err) {
      setError(errorMessage(err, "Couldn't upload your ID document — try again."));
    } finally {
      setPending(false);
    }
  }

  async function submitProperty(e: React.FormEvent) {
    e.preventDefault();
    if (!docFile) return;
    setError(null);
    setPending(true);
    try {
      const property = await api<Property>("/listings/properties", {
        method: "POST",
        body: JSON.stringify({ name: propertyName, streetAddress }),
      });
      const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      const { publicId } = await uploadToCloudinary(docFile, sig);
      await api(`/listings/properties/${property.id}/documents`, {
        method: "POST",
        body: JSON.stringify({ docType, storageKey: publicId }),
      });
      router.push("/landlord");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit your property — try again."));
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md shadow-md">
      <CardContent className="p-6 sm:p-8">
        {step === "legal" && (
          <>
            <StepHeader
              step="legal"
              title="Your legal name"
              description="This must match the name on your ID document — our team verifies it before approving your account."
            />
            <form onSubmit={submitLegalName} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="legalName">Legal name</Label>
                <Input
                  id="legalName"
                  required
                  minLength={2}
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="As it appears on your national ID"
                />
              </div>
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Saving…" : "Continue"}
              </Button>
            </form>
          </>
        )}

        {step === "id-doc" && (
          <>
            <StepHeader
              step="id-doc"
              title="Upload your ID document"
              description="A national ID, passport, or driving permit. Our team reviews this before your account is verified."
            />
            <form onSubmit={submitIdDoc} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="idFile">ID document</Label>
                <Input
                  id="idFile"
                  type="file"
                  required
                  accept="image/*,.pdf"
                  onChange={(e) => setIdFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={pending || !idFile} className="w-full">
                {pending ? "Uploading…" : "Upload and continue"}
              </Button>
            </form>
          </>
        )}

        {step === "property" && (
          <>
            <StepHeader
              step="property"
              title="Submit your property"
              description="Our Ops team schedules a physical verification visit once this is submitted."
            />
            <form onSubmit={submitProperty} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="propertyName">Property name</Label>
                <Input
                  id="propertyName"
                  required
                  minLength={2}
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder="e.g. Sunrise Hostel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="streetAddress">Street address</Label>
                <Input
                  id="streetAddress"
                  required
                  minLength={3}
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="Street, area, city"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="docType">Supporting document type</Label>
                <select
                  id="docType"
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocType)}
                  className={cn(
                    "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
                    "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
                  )}
                >
                  {DOC_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {DOC_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="docFile">Document file</Label>
                <Input
                  id="docFile"
                  type="file"
                  required
                  accept="image/*,.pdf"
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" disabled={pending || !docFile} className="w-full">
                {pending ? "Submitting…" : "Submit property"}
              </Button>
            </form>
          </>
        )}

        <p aria-live="polite" role="status" className="mt-4 min-h-5 text-sm text-destructive">
          {error}
        </p>
      </CardContent>
    </Card>
  );
}
