"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";
import type { ReservationStudent } from "@campushomes/shared";

import { UNIVERSITY_LABELS } from "@/components/university-select-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";

/** The student behind a booking, for the landlord (Festo, 2026-10-23).
 * Contact and registration details only; passwords are never shown. */
export function StudentDetailsButton({ reservationId }: { reservationId: string }) {
  const [open, setOpen] = useState(false);
  const [student, setStudent] = useState<ReservationStudent | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function show() {
    setOpen(true);
    setError(null);
    try {
      setStudent(await api<ReservationStudent>(`/reservations/${reservationId}/student`));
    } catch (caught) {
      setError(apiErrorMessage(caught, "Couldn't load this student's details."));
    }
  }

  const rows: [string, string | null][] = student
    ? [
        ["Full name", student.name],
        ["Phone", student.phone],
        ["Email", student.email],
        ["University", student.university ? (UNIVERSITY_LABELS[student.university as keyof typeof UNIVERSITY_LABELS] ?? student.university) : null],
        ["Year of study", student.yearOfStudy != null ? String(student.yearOfStudy) : null],
        ["Gender", student.gender],
        ["Emergency contact", [student.emergencyContactName, student.emergencyContactPhone].filter(Boolean).join(" · ") || null],
      ]
    : [];

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => void show()} className="gap-1.5">
        <UserRound aria-hidden className="size-4" />
        Student
      </Button>
      {open && (
        <Dialog aria-label="Student details" open onOpenChange={setOpen} size="md">
          <DialogHeader
            title={student?.name ?? "Student details"}
            description="Registration details for this booking. Passwords are never shown; students reset their own, and only a super admin can reset one for them."
            onClose={() => setOpen(false)}
          />
          <DialogBody>
            {error ? (
              <p role="alert" className="text-sm text-destructive">{error}</p>
            ) : !student ? (
              <p role="status" className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                  {rows.map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
                      <dd className="mt-0.5 [overflow-wrap:anywhere]">{value || <span className="text-muted-foreground">Not provided</span>}</dd>
                    </div>
                  ))}
                </dl>
                {!student.hasSignedIn && (
                  <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    This student hasn&apos;t signed in to CampusHomes yet. They sign in with the phone or email above to see the booking.
                  </p>
                )}
              </>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
