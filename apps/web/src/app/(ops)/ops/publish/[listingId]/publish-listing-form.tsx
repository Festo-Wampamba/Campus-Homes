"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";

const AMENITY_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "water_supply", label: "Water supply" },
  { key: "power_backup", label: "Power backup" },
  { key: "wifi", label: "Wi-Fi" },
  { key: "security_guard", label: "Security guard" },
  { key: "parking", label: "Parking" },
  { key: "furnished", label: "Furnished" },
];

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

export function PublishListingForm({ listingId }: { listingId: string }) {
  const router = useRouter();
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [unitLabels, setUnitLabels] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!price) return;
    setError(null);
    setPending(true);
    try {
      const units = unitLabels
        .split("\n")
        .map((label) => label.trim())
        .filter(Boolean)
        .map((label) => ({ label, capacity: 1 }));
      await api("/ops/listings/publish", {
        method: "POST",
        body: JSON.stringify({
          listingId,
          pricePerTermUgx: Number(price),
          amenities,
          description: description || undefined,
          units,
        }),
      });
      router.push("/ops");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't publish the listing — try again."));
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="price">Price per term (UGX)</Label>
        <Input
          id="price"
          type="number"
          min={1}
          required
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Amenities</Label>
        <div className="grid grid-cols-2 gap-2">
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
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="units">Units (one label per line, e.g. &quot;Room 1A&quot;)</Label>
        <Textarea
          id="units"
          value={unitLabels}
          onChange={(e) => setUnitLabels(e.target.value)}
          placeholder={"Room 1A\nRoom 1B"}
        />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Publishing…" : "Publish listing"}
      </Button>
      <p role="status" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}
