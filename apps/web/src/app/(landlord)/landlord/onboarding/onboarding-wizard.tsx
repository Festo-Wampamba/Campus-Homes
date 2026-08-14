"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UNIVERSITIES, type LandlordProfile, type Property, type University } from "@campushomes/shared";

import { RoomCategoryRows, type RoomCategoryRow } from "@/components/room-category-rows";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = "legal" | "property";

const UNIVERSITY_LABELS: Record<University, string> = {
  MUK: "Makerere University",
  MUBS: "Makerere University Business School",
  KIU: "Kampala International University",
  KYU: "Kyambogo University",
  other: "Other / not listed",
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
  const [propertyName, setPropertyName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [catchment, setCatchment] = useState<University>("MUK");
  const [roomCategoryRows, setRoomCategoryRows] = useState<RoomCategoryRow[]>([]);
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
    setPending(true);
    try {
      const proposedRoomCategories = roomCategoryRows
        .filter((row) => Number(row.roomCount) > 0 && Number(row.pricePerTermUgx) > 0)
        .map((row) => ({
          category: row.category,
          roomCount: Number(row.roomCount),
          pricePerTermUgx: Number(row.pricePerTermUgx),
        }));
      await api<Property>("/listings/properties", {
        method: "POST",
        body: JSON.stringify({ name: propertyName, streetAddress, catchment, proposedRoomCategories }),
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
