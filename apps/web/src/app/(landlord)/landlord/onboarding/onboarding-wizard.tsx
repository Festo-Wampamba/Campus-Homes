"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  PROPERTY_TYPES,
  UNIVERSITIES,
  type LandlordProfile,
  type Property,
  type PropertyType,
  type University,
} from "@campushomes/shared";

import {
  emptyLandlordIdentityFields,
  LandlordIdentityFields,
  type LandlordIdentityFieldsValue,
} from "@/components/landlord-identity-fields";
import {
  emptyPropertyDeclarationFields,
  PropertyDeclarationFields,
  propertyDeclarationsAllAccepted,
  type PropertyDeclarationFieldsValue,
} from "@/components/property-declaration-fields";
import {
  emptyPropertyExtendedFields,
  PropertyExtendedFields,
  serializePropertyExtendedFields,
  type PropertyExtendedFieldsValue,
} from "@/components/property-extended-fields";
import { RoomCategoryRows, type RoomCategoryRow } from "@/components/room-category-rows";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { AMENITY_OPTIONS, humanizeKey } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = "legal" | "property";

const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University",
  MUBS: "Makerere University Business School",
  KIU: "Kampala International University",
  KYU: "Kyambogo University",
  other: "Other / not listed",
};

const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  hostel: "Hostel",
  apartment: "Apartment",
  hall: "Hall of residence",
  boarding_house: "Boarding house",
  shared_house: "Shared house",
  studio: "Studio",
  other: "Other",
};

const STEP_INDEX: Record<Step, number> = { legal: 1, property: 2 };

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
        Step {STEP_INDEX[step]} of 2
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
  const [landlordIdentity, setLandlordIdentity] = useState<LandlordIdentityFieldsValue>(
    emptyLandlordIdentityFields(),
  );
  const [propertyName, setPropertyName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [type, setType] = useState<PropertyType>("hostel");
  const [catchment, setCatchment] = useState<University>("MUK");
  const [roomCategoryRows, setRoomCategoryRows] = useState<RoomCategoryRow[]>([]);
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [customAmenity, setCustomAmenity] = useState("");
  const [coverPhotoFile, setCoverPhotoFile] = useState<File | null>(null);
  const [extended, setExtended] = useState<PropertyExtendedFieldsValue>(emptyPropertyExtendedFields());
  const [declaration, setDeclaration] = useState<PropertyDeclarationFieldsValue>(
    emptyPropertyDeclarationFields(),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownAmenityKeys = useMemo(() => new Set(AMENITY_OPTIONS.map((o) => o.key)), []);
  const customAmenityKeys = Object.keys(amenities).filter(
    (key) => amenities[key] && !knownAmenityKeys.has(key),
  );

  function addCustomAmenity() {
    const key = customAmenity.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!key) return;
    setAmenities((prev) => ({ ...prev, [key]: true }));
    setCustomAmenity("");
  }

  function removeAmenity(key: string) {
    setAmenities((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const coverPhotoPreview = useMemo(
    () => (coverPhotoFile ? URL.createObjectURL(coverPhotoFile) : null),
    [coverPhotoFile],
  );

  useEffect(() => {
    return () => {
      if (coverPhotoPreview) URL.revokeObjectURL(coverPhotoPreview);
    };
  }, [coverPhotoPreview]);

  async function submitLegalName(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api("/landlords/profile", {
        method: "POST",
        body: JSON.stringify({
          legalName,
          whatsappNumber: landlordIdentity.whatsappNumber.trim() || null,
          businessType: landlordIdentity.businessType,
          businessTypeOther:
            landlordIdentity.businessType === "other"
              ? landlordIdentity.businessTypeOther.trim() || null
              : null,
        }),
      });
      setStep("property");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your legal name — try again."));
    } finally {
      setPending(false);
    }
  }

  async function submitProperty(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!propertyDeclarationsAllAccepted(declaration)) {
      setError("Please accept every item in the consent & declaration section.");
      return;
    }
    setPending(true);
    try {
      let coverPhotoKey: string | undefined;
      if (coverPhotoFile) {
        const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
        const { publicId } = await uploadToCloudinary(coverPhotoFile, sig);
        coverPhotoKey = publicId;
      }
      const proposedRoomCategories = roomCategoryRows
        .filter((row) => Number(row.roomCount) > 0 && Number(row.pricePerTermUgx) > 0)
        .map((row) => ({
          category: row.category,
          roomCount: Number(row.roomCount),
          pricePerTermUgx: Number(row.pricePerTermUgx),
        }));
      await api<Property>("/listings/properties", {
        method: "POST",
        body: JSON.stringify({
          name: propertyName,
          streetAddress,
          type,
          catchment,
          proposedRoomCategories,
          proposedAmenities: amenities,
          ...serializePropertyExtendedFields(extended),
          ...declaration,
          ...(coverPhotoKey ? { coverPhotoKey } : {}),
        }),
      });
      router.push("/landlord");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't submit your property — try again."));
      setPending(false);
    }
  }

  return (
    <Card className={cn("w-full shadow-md", step === "property" ? "max-w-xl" : "max-w-md")}>
      <CardContent className="p-6 sm:p-8">
        {step === "legal" && (
          <>
            <StepHeader
              step="legal"
              title="Your legal name"
              description="Our team verifies this before approving your account."
            />
            <form onSubmit={submitLegalName} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="legalName" required>Legal name</Label>
                <Input
                  id="legalName"
                  required
                  minLength={2}
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="As it appears on your national ID"
                />
              </div>
              <LandlordIdentityFields
                value={landlordIdentity}
                onChange={(patch) => setLandlordIdentity((prev) => ({ ...prev, ...patch }))}
                idPrefix="onboarding-landlord"
              />
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? "Saving…" : "Continue"}
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
                <Label htmlFor="propertyName" required>Property name</Label>
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
                <Label htmlFor="streetAddress" required>Street address</Label>
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
                <Label htmlFor="propertyType">Property type</Label>
                <select
                  id="propertyType"
                  value={type}
                  onChange={(e) => setType(e.target.value as PropertyType)}
                  className={cn(
                    "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
                    "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
                  )}
                >
                  {PROPERTY_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {PROPERTY_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="catchment">Nearest university</Label>
                <select
                  id="catchment"
                  value={catchment}
                  onChange={(e) => setCatchment(e.target.value as University)}
                  className={cn(
                    "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs transition-colors duration-150",
                    "focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:h-10",
                  )}
                >
                  {UNIVERSITIES.map((code) => (
                    <option key={code} value={code}>
                      {UNIVERSITY_LABELS[code]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="propertyPhoto">Cover photo (optional)</Label>
                <div className="flex items-center gap-3">
                  {coverPhotoPreview && (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                    <img src={coverPhotoPreview} alt="" className="size-11 shrink-0 rounded-md object-cover" />
                  )}
                  <Input
                    id="propertyPhoto"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setCoverPhotoFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Room types & pricing (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Tell us what you have in mind — e.g. 30 singles at UGX
                  300,000, 40 doubles at UGX 700,000. Our team confirms exact
                  pricing and room counts during the verification visit.
                </p>
                <RoomCategoryRows
                  rows={roomCategoryRows}
                  onChange={setRoomCategoryRows}
                  idPrefix="onboarding-room"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Amenities (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  What the property offers — Ops confirms these during verification.
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-md border border-border p-3">
                  {AMENITY_OPTIONS.map((option) => (
                    <label key={option.key} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={amenities[option.key] ?? false}
                        onChange={(e) =>
                          setAmenities((prev) => ({ ...prev, [option.key]: e.target.checked }))
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {customAmenityKeys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customAmenityKeys.map((key) => (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground"
                      >
                        {humanizeKey(key)}
                        <button type="button" aria-label={`Remove ${humanizeKey(key)}`} onClick={() => removeAmenity(key)}>
                          <X aria-hidden className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Input
                    value={customAmenity}
                    onChange={(e) => setCustomAmenity(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomAmenity();
                      }
                    }}
                    placeholder="Add a custom amenity…"
                    className="h-9"
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addCustomAmenity}>
                    Add
                  </Button>
                </div>
              </div>

              <PropertyExtendedFields
                value={extended}
                onChange={(patch) => setExtended((prev) => ({ ...prev, ...patch }))}
                idPrefix="onboarding-property"
              />

              <PropertyDeclarationFields
                value={declaration}
                onChange={(patch) => setDeclaration((prev) => ({ ...prev, ...patch }))}
              />

              <Button type="submit" disabled={pending} className="w-full">
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
