"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import type { LandlordRating, MyLandlordRating } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, apiErrorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** A student's rating of the landlord in an open conversation. The API
 * decides eligibility (reserved with this landlord and messaged them, 0073);
 * this only reflects it. `hasMessaged` re-checks once the first message lands. */
export function RateLandlord({ landlordId, hasMessaged }: { landlordId: string; hasMessaged: boolean }) {
  const [mine, setMine] = useState<MyLandlordRating | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<MyLandlordRating>(`/landlord-ratings/landlords/${landlordId}/mine`)
      // Optional extra: if the check fails, the rate button just stays hidden.
      .then((result) => { if (!cancelled) setMine(result); }, () => { if (!cancelled) setMine(null); });
    return () => { cancelled = true; };
  }, [landlordId, hasMessaged]);

  if (mine?.rating) {
    return <span className="flex items-center gap-1 text-xs text-muted-foreground">You rated <Stars value={mine.rating.rating} /></span>;
  }
  if (!mine?.canRate) return null;
  return <>
    <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><Star aria-hidden />Rate landlord</Button>
    {open && <RateDialog landlordId={landlordId} onClose={() => setOpen(false)} onRated={(rating) => { setMine({ canRate: false, rating }); setOpen(false); }} />}
  </>;
}

function RateDialog({ landlordId, onClose, onRated }: { landlordId: string; onClose: () => void; onRated: (rating: LandlordRating) => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!rating) { setError("Choose from 1 to 5 stars."); return; }
    setSaving(true);
    setError(null);
    try {
      onRated(await api<LandlordRating>("/landlord-ratings", {
        method: "POST",
        body: JSON.stringify({ landlordId, rating, comment: comment.trim() || undefined }),
      }));
    } catch (caught) {
      setError(apiErrorMessage(caught, "Could not save your rating. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return <Dialog aria-label="Rate this landlord" open onOpenChange={(next) => { if (!next) onClose(); }} size="sm">
    <form onSubmit={submit} className="contents">
      <DialogHeader title="Rate this landlord" description="Your rating is shown without your name. You can rate each landlord once." onClose={onClose} />
      <DialogBody className="space-y-4">
        <fieldset>
          <legend className="text-sm font-semibold">Your rating</legend>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => <label key={n} className="grid size-11 cursor-pointer place-items-center rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring">
              <input type="radio" name="landlord-rating" value={n} checked={rating === n} onChange={() => setRating(n)} className="sr-only" />
              <Star aria-hidden className={cn("size-7", n <= rating ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />
              <span className="sr-only">{n} {n === 1 ? "star" : "stars"}</span>
            </label>)}
          </div>
        </fieldset>
        <label className="block text-sm font-semibold">
          Comment (optional)
          <Textarea className="mt-2" maxLength={1000} rows={4} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="How did the landlord treat you? Were replies clear and on time?" />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Submit rating"}</Button>
      </DialogFooter>
    </form>
  </Dialog>;
}

export function Stars({ value }: { value: number }) {
  return <span role="img" aria-label={`${value} out of 5 stars`} className="inline-flex">
    {[1, 2, 3, 4, 5].map((n) => <Star key={n} aria-hidden className={cn("size-3.5", n <= Math.round(value) ? "fill-amber-500 text-amber-500" : "text-muted-foreground")} />)}
  </span>;
}
