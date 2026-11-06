"use client";

import { useState } from "react";
import { TenantImportPanel } from "./tenant-import-panel";
import { emptyTenantRow as emptyRow, importedTenantRows, rematchImportedTenantRows, studentName, type TenantIntakeRow as Row } from "./tenant-intake-rows";
import { useRouter } from "next/navigation";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { UNIVERSITIES, tenantIntakeEntrySchema, type TenantIntakeResult, type University } from "@campushomes/shared";

import type { WalkInBed } from "@/app/(landlord)/landlord/bookings/room-lookup";
import { PAYMENT_METHOD_LABEL } from "@/components/landlord/confirm-booking-dialog";
import { UNIVERSITY_LABELS } from "@/components/university-select-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { api, apiErrorMessage } from "@/lib/api";
import { formatUgx } from "@/lib/format";

const FIELD = "mt-1 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
export function WalkInStudentButton({ beds }: { beds: WalkInBed[] }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button type="button" onClick={() => setOpen(true)} className="gap-1.5"><UserPlus aria-hidden className="size-4" />Add students</Button>
    {open && <WalkInStudentDialog beds={beds} onClose={() => setOpen(false)} />}
  </>;
}

function WalkInStudentDialog({ beds: initialBeds, onClose }: { beds: WalkInBed[]; onClose: () => void }) {
  const router = useRouter();
  const [beds, setBeds] = useState(initialBeds);
  const [entryMode, setEntryMode] = useState<'manual' | 'import'>('manual');
  const [manualRows, setManualRows] = useState<Row[]>(() => [emptyRow(initialBeds[0]?.id)]);
  const [importRows, setImportRows] = useState<Row[]>([]);
  const [importReviewed, setImportReviewed] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const rows = entryMode === 'manual' ? manualRows : importRows;
  const setRows = entryMode === 'manual' ? setManualRows : setImportRows;
  const [results, setResults] = useState<Record<string, TenantIntakeResult>>({});
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const complete = (key: string) => results[key] && results[key].status !== "failed";
  const editable = rows.filter((row) => !complete(row.key));

  function update(key: string, patch: Partial<Row>) {
    setRows((items) => items.map((row) => row.key === key ? { ...row, ...patch } : row));
    setResults((current) => { const next = { ...current }; delete next[key]; return next; });
  }
  async function refreshBeds() {
    setError(null);
    try {
      const fresh = await api<WalkInBed[]>("/reservations/walk-in-beds");
      setBeds(fresh);
      setResults((current) => Object.fromEntries(Object.entries(current).filter(([,result]) => result.status !== "failed")));
      setImportRows((current) => {
        const rematched = new Map(rematchImportedTenantRows(current.filter((row) => !complete(row.key)), fresh).map((row) => [row.key,row]));
        return current.map((row) => rematched.get(row.key) ?? row);
      });
    }
    catch (caught) { setError(apiErrorMessage(caught, "Could not load free beds. Try again.")); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (entryMode === 'import' && (!importReviewed || importBusy || !rows.length)) return;
    const entries = [];
    const invalid: Record<string, TenantIntakeResult> = {};
    for (const row of editable) {
      const bed = beds.find((bed) => bed.id === row.bedId);
      const shared = { bedId: row.bedId, semesterId: bed?.semesterId, idempotencyKey: row.key, movedIn: row.movedIn,
        bookingFeeCollectedUgx: row.paid ? Number(row.paid) || undefined : undefined, paymentMethod: row.paymentMethod || undefined };
      const parsed = tenantIntakeEntrySchema.safeParse(row.kind === "new"
        ? { ...shared, kind: "new", name: studentName(row), firstName: row.firstName.trim(), lastName: row.lastName.trim(), gender: row.gender || undefined, phone: row.phone, email: row.email.trim() || undefined, university: row.university }
        : { ...shared, kind: "existing", contact: row.contact });
      const invalidMoney = Boolean(row.paid) && (!/^\d+$/.test(row.paid) || !Number.isSafeInteger(Number(row.paid)));
      const message = invalidMoney ? "Enter a whole UGX amount, using digits only." : !bed ? "Choose an available bed." : Number(row.paid) > bed.pricePerTermUgx ? "Amount paid exceeds this room’s rent." : !parsed.success ? parsed.error.issues[0]?.message : null;
      if (message) invalid[row.key] = { key: row.key, status: "failed", message };
      else if (parsed.success) entries.push(parsed.data);
    }
    if (Object.keys(invalid).length) { setResults((current) => ({ ...current, ...invalid })); return; }
    if (!entries.length) return;
    setPending(true);
    setProgress({ done: 0, total: entries.length });
    try {
      // Keep each request within the normal API timeout, show progress, and
      // retain earlier successes if a later chunk loses its connection.
      for (let start = 0; start < entries.length; start += 5) {
        const chunk = entries.slice(start, start + 5);
        const saved = await api<TenantIntakeResult[]>("/reservations/tenant-intake", { method: "POST", body: JSON.stringify({ entries: chunk }) });
        setResults((current) => ({ ...current, ...Object.fromEntries(saved.map((result) => [result.key, result])) }));
        setProgress({ done: start + chunk.length, total: entries.length });
      }
    } catch (caught) { setError(apiErrorMessage(caught, "Could not save these students. Retry to check each entry.")); }
    finally { setPending(false); router.refresh(); }
  }
  return (
    <Dialog aria-label="Add students" open onOpenChange={(open) => { if (!open && !pending) onClose(); }} size="xl" resizable dismissible={false}>
      <form onSubmit={submit} className="contents">
        <DialogHeader className="gap-2 p-3 sm:p-5" title="Add students" onClose={() => { if (!pending) onClose(); }} />
        <DialogBody className="space-y-5">
          <p className="text-sm text-muted-foreground">Add a walk-in or students already living at your property, one at a time or as a batch. Available beds include approved managed-only and listed properties.</p>
          <div role="group" aria-label="Choose how to add students" className="space-y-3">
            <Button type="button" variant={entryMode === 'import' ? 'primary' : 'secondary'} aria-pressed={entryMode === 'import'} disabled={pending || importBusy}
              className={`h-auto min-h-14 w-full whitespace-normal px-4 py-3 text-lg ${entryMode === 'import' ? '' : 'border-primary/50 bg-primary/10 text-primary hover:bg-primary/20'}`}
              onClick={() => { setEntryMode('import'); setError(null); }}>Import tenant records</Button>
            <Button type="button" variant="secondary" aria-pressed={entryMode === 'manual'} disabled={pending || importBusy}
              className={`h-auto min-h-11 w-full whitespace-normal px-4 py-2 ${entryMode === 'manual' ? 'border-primary text-primary' : ''}`}
              onClick={() => { setEntryMode('manual'); setError(null); }}>Enter manually</Button>
          </div>
          <div hidden={entryMode !== 'import'}>
            <TenantImportPanel disabled={pending || importRows.some((row) => Boolean(complete(row.key)))}
              onRecordsChange={(records) => setImportRows((current) => {
                // Changing the selected document rows must preserve corrections
                // and retry keys on entries that remain selected.
                const selectedNumbers = new Set(records.map((record) => record.rowNumber));
                const kept = current.filter((row) => selectedNumbers.has(row.documentRowNumber!));
                const keptNumbers = new Set(kept.map((row) => row.documentRowNumber));
                const added = importedTenantRows(records.filter((record) => !keptNumbers.has(record.rowNumber)), beds, kept.map((row) => row.bedId));
                const mapped = new Map([...kept, ...added].map((row) => [row.documentRowNumber, row]));
                return records.map((record) => mapped.get(record.rowNumber)!);
              })}
              onReviewedChange={setImportReviewed} onBusyChange={setImportBusy} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{beds.length} free beds · {rows.length} {rows.length === 1 ? "student" : "students"}</p>
            <Button type="button" variant="secondary" disabled={pending} onClick={refreshBeds}>Refresh beds</Button>
          </div>
          {beds.length === 0 && <p role="alert" className="rounded-md border border-border p-3 text-sm">No free beds right now. Check that the property is approved, rooms are open and priced for a current or upcoming semester, and beds are not occupied or blocked. Managed-only properties do not need a public listing.</p>}
          {rows.map((row, index) => {
            const bed = beds.find((bed) => bed.id === row.bedId);
            const result = results[row.key];
            const locked = Boolean(complete(row.key));
            const overpaid = Boolean(bed && Number(row.paid) > bed.pricePerTermUgx);
            return <fieldset key={row.key} disabled={pending || locked} className="min-w-0 space-y-4 rounded-lg border border-border p-4">
              <legend className="max-w-full break-words px-1 font-semibold">Student{studentName(row) ? ` · ${studentName(row)}` : ""}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-sm font-semibold">Account
                  <select className={FIELD} value={row.kind} onChange={(e) => update(row.key, { kind: e.target.value as Row["kind"] })}>
                    <option value="new">New CampusHomes student</option><option value="existing">Existing CampusHomes student</option>
                  </select>
                </label>
                {entryMode === 'manual' && rows.length > 1 && !locked && <Button aria-label={`Remove student ${index + 1}`} type="button" variant="secondary" onClick={() => setRows((items) => items.filter((item) => item.key !== row.key))}><Trash2 aria-hidden className="size-4" /></Button>}
              </div>
              {row.kind === "new" ? <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="text-sm font-semibold">First name *<input required maxLength={60} autoComplete="given-name" className={FIELD} value={row.firstName} onChange={(e) => update(row.key, { firstName: e.target.value })} /></label>
                <label className="text-sm font-semibold">Last name *<input required maxLength={60} autoComplete="family-name" className={FIELD} value={row.lastName} onChange={(e) => update(row.key, { lastName: e.target.value })} /></label>
                <label className="text-sm font-semibold">Gender<select className={FIELD} value={row.gender} onChange={(e) => update(row.key, { gender: e.target.value as Row["gender"] })}><option value="">Not recorded</option><option value="male">Male</option><option value="female">Female</option></select></label>
                <label className="text-sm font-semibold">Phone number *<input required type="tel" className={FIELD} placeholder="0771 234567" value={row.phone} onChange={(e) => update(row.key, { phone: e.target.value })} /></label>
                <label className="text-sm font-semibold">Email (optional)<input type="email" className={FIELD} value={row.email} onChange={(e) => update(row.key, { email: e.target.value })} /></label>
                <label className="text-sm font-semibold">University *<select className={FIELD} value={row.university} onChange={(e) => update(row.key, { university: e.target.value as University })}>{UNIVERSITIES.map((id) => <option key={id} value={id}>{UNIVERSITY_LABELS[id]}</option>)}</select></label>
              </div> : <div>
                {(studentName(row)||row.gender)&&<p className="mb-3 text-sm text-muted-foreground">Imported reference: {studentName(row)}{row.gender ? ` · ${row.gender}` : ""}. Existing account names and gender are unchanged.</p>}
                <label className="text-sm font-semibold">Verified email or phone *<input required className={FIELD} value={row.contact} onChange={(e) => update(row.key, { contact: e.target.value })} /></label>
                <p className="mt-2 text-sm text-muted-foreground">The student reviews and accepts this room in My reservations. Their profile stays unchanged, and the bed is booked only after acceptance. Requests expire after seven days.</p>
              </div>}
              <label className="block text-sm font-semibold">Property, room and bed *
                <select required className={FIELD} value={row.bedId} onChange={(e) => update(row.key, { bedId: e.target.value, assignmentNote: undefined, assignmentProblem: undefined })}>
                  <option value="">Choose a free bed</option>
                  {beds.map((candidate) => <option key={candidate.id} value={candidate.id} disabled={rows.some((other) => other.key !== row.key && other.bedId === candidate.id)}>{candidate.propertyName} · {candidate.roomLabel} · {candidate.bedLabel}{candidate.semesterName ? ` · ${candidate.semesterName}` : ""}</option>)}
                </select>
              </label>
              {!bed && <p role="alert" className="text-sm text-destructive">{row.assignmentProblem ?? "Choose a room and free bed first. Rent and balance will appear after assignment."}</p>}
              {bed && row.assignmentNote && <p role="status" className="rounded-md bg-primary/10 p-3 text-sm text-primary">{row.assignmentNote}</p>}
              <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-semibold">Amount paid (UGX)<input type="text" inputMode="numeric" pattern="[0-9]*" className={FIELD} value={row.paid} onChange={(e) => update(row.key, { paid: e.target.value })} aria-invalid={overpaid || undefined} /></label>
                <label className="text-sm font-semibold">Paid with<select className={FIELD} value={row.paymentMethod} onChange={(e) => update(row.key, { paymentMethod: e.target.value })}><option value="">Not recorded</option>{Object.entries(PAYMENT_METHOD_LABEL).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
                <div className="min-w-0 text-sm font-semibold"><p>Rent (UGX)</p><output aria-label="Rent" className={`${FIELD} flex items-center break-all bg-muted/40 tabular-nums`}>{bed ? formatUgx(bed.pricePerTermUgx) : "Select a room first"}</output></div>
                <div className="min-w-0 text-sm font-semibold"><p>Balance (UGX)</p><output aria-label="Balance" aria-live="polite" className={`${FIELD} flex items-center break-all bg-muted/40 tabular-nums`}>{bed ? formatUgx(Math.max(0, bed.pricePerTermUgx - (Number(row.paid) || 0))) : "Select a room first"}</output></div>
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={row.movedIn} onChange={(e) => update(row.key, { movedIn: e.target.checked })} />Already moved in / living here</label>
              {!!row.importWarnings?.length && <div role="note" className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-sm"><p className="font-semibold">Review imported row</p>{row.importWarnings.map((warning)=><p key={warning}>{warning}</p>)}</div>}
              {overpaid && !result && <p role="alert" className="text-sm text-destructive">Amount paid exceeds this room’s rent.</p>}
              {result && <p role={result.status === "failed" ? "alert" : "status"} className={`rounded-md p-3 text-sm ${result.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-foreground"}`}>
                {result.status === "added" ? "Student added and bed booked." : result.status === "requested" ? "Request recorded. Ask the student to check My reservations using the verified contact above. No booking is made until they accept." : result.message}
              </p>}
            </fieldset>;
          })}
          {entryMode === 'manual' && <Button type="button" variant="secondary" disabled={pending || rows.length >= 50} onClick={() => setRows((items) => [...items, emptyRow(beds.find((bed) => !items.some((row) => row.bedId === bed.id))?.id)])}><Plus aria-hidden className="mr-2 size-4" />Add another student</Button>}
          <p className="text-xs text-muted-foreground">Up to 50 students per batch. Successful rows stay saved; retry only the rows that need corrections.</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </DialogBody>
        <DialogFooter className="flex-wrap [&>*]:h-auto [&>*]:min-h-11 [&>*]:whitespace-normal [&>*]:py-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>{rows.length > 0 && !editable.length ? "Done" : "Close"}</Button>
          {(editable.length > 0 || (entryMode === 'import' && !rows.length)) && <Button type="submit" disabled={pending || beds.length === 0 || (entryMode === 'import' && (!importReviewed || importBusy || !rows.length)) || editable.some((row) => { const bed = beds.find((bed) => bed.id === row.bedId); return Boolean(bed && Number(row.paid) > bed.pricePerTermUgx); })}>{pending ? `Saving… ${progress.done}/${progress.total}` : entryMode === 'import' ? `Save ${editable.length || ""} imported ${editable.length === 1 ? "student" : "students"}`.replace(/  /g, " ") : editable.length === 1 ? "Save student" : `Save ${editable.length} students`}</Button>}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
