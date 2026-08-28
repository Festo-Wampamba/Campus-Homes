"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import type { VerificationChecklistComponent, VisitCorrection } from "@campushomes/shared";

import { api, ApiError } from "@/lib/api";
import { uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusChip } from "@/components/status-chip";
import { Textarea } from "@/components/ui/textarea";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { message?: string | string[] } | null;
    if (typeof body?.message === "string") return body.message;
    if (Array.isArray(body?.message)) return body.message.join(", ");
  }
  return fallback;
}

/** One flagged checklist item, editable inline and resubmitted directly to
 * the API — deliberately NOT routed through the offline IndexedDB draft/
 * sync system the rest of this form uses (inspection-db.ts, sync-manager.ts):
 * a correction fix is a quick, always-online top-up to an already-submitted
 * visit, not the original multi-field offline capture. */
function CorrectionItem({
  visitId,
  component,
  label,
  correction,
  initialPassed,
  initialNotes,
  onResolved,
}: {
  visitId: string;
  component: VerificationChecklistComponent;
  label: string;
  correction: VisitCorrection;
  initialPassed: boolean | null;
  initialNotes: string;
  onResolved: () => void;
}) {
  const [passed, setPassed] = useState<boolean | null>(initialPassed);
  const [notes, setNotes] = useState(initialNotes);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resubmit() {
    if (passed === null) return;
    setPending(true);
    setError(null);
    try {
      const newPhotoStorageKeys: string[] = [];
      for (const file of files) {
        const sig = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
        const { publicId } = await uploadToCloudinary(file, sig);
        newPhotoStorageKeys.push(publicId);
      }
      await api(`/ops/visits/${visitId}/checklist-item`, {
        method: "PATCH",
        body: JSON.stringify({
          component,
          passed,
          notes: notes.trim() || undefined,
          ...(newPhotoStorageKeys.length > 0 ? { newPhotoStorageKeys } : {}),
        }),
      });
      onResolved();
    } catch (err) {
      setError(errorMessage(err, "Couldn't resubmit — try again."));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-foreground">{label}</p>
          <StatusChip tone="warning">Needs a fix</StatusChip>
        </div>
        <p className="text-sm text-muted-foreground">{correction.message}</p>

        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant={passed === true ? "primary" : "secondary"}
            onClick={() => setPassed(true)}
          >
            Pass
          </Button>
          <Button
            type="button"
            size="sm"
            variant={passed === false ? "destructive" : "secondary"}
            onClick={() => setPassed(false)}
          >
            Fail
          </Button>
        </div>
        <Textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

        {component === "photos" && (
          <div className="space-y-2">
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">{files.length} new photo(s) selected.</p>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-teal-700">
              <Camera aria-hidden className="size-4" />
              Take/add replacement photos
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (picked.length > 0) setFiles((prev) => [...prev, ...picked]);
                }}
              />
            </label>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" disabled={pending || passed === null} onClick={resubmit}>
          {pending ? "Resubmitting…" : "Resubmit for review"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function CorrectionFixPanel({
  visitId,
  corrections,
  componentLabel,
  checklist,
}: {
  visitId: string;
  corrections: VisitCorrection[];
  componentLabel: Record<VerificationChecklistComponent, string>;
  checklist: Partial<Record<VerificationChecklistComponent, { passed: boolean; notes?: string }>>;
}) {
  const router = useRouter();
  const open = corrections.filter((c) => c.status === "open");
  if (open.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-warning">
        The lead sent {open.length === 1 ? "one item" : `${open.length} items`} back for correction:
      </p>
      {open.map((correction) => (
        <CorrectionItem
          key={correction.id}
          visitId={visitId}
          component={correction.component}
          label={componentLabel[correction.component]}
          correction={correction}
          initialPassed={checklist[correction.component]?.passed ?? null}
          initialNotes={checklist[correction.component]?.notes ?? ""}
          onResolved={() => router.refresh()}
        />
      ))}
    </div>
  );
}
