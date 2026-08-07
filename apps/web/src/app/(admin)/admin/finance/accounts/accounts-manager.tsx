"use client";

import type { LedgerAccount, LedgerAccountType } from "@campushomes/shared";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AdminField, AdminModal, adminFieldClass, adminTextareaClass } from "@/components/admin/admin-modal";
import { StatusBadge } from "@/components/admin/admin-ui";
import { api, ApiError, apiErrorMessage } from "@/lib/api";

const ACCOUNT_TYPES: LedgerAccountType[] = ["asset", "liability", "equity", "revenue", "expense"];

const emptyAccountForm = { code: "", name: "", accountType: "expense" as LedgerAccountType, parentId: "", description: "" };
const emptyEntryForm = { entryDate: new Date().toISOString().slice(0, 10), memo: "", debitAccountId: "", creditAccountId: "", amountUgx: "" };

function buttonClass(tone: "primary" | "secondary" = "secondary") {
  return `inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-45 ${tone === "primary" ? "bg-teal-600 text-white hover:bg-teal-700" : "border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-border dark:text-foreground dark:hover:bg-muted"}`;
}

export function AccountsManager({ accounts, canManage }: { accounts: LedgerAccount[]; canManage: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"create-account" | "manual-entry" | null>(null);
  const [accountForm, setAccountForm] = useState(emptyAccountForm);
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(accounts.map((account) => [account.id, account]));

  function close() {
    if (pending) return;
    setMode(null);
    setNotice(null);
    setError(null);
  }

  async function toggleActive(account: LedgerAccount) {
    setPending(true);
    setError(null);
    try {
      await api(`/admin/finance/accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ isActive: !account.isActive }) });
      router.refresh();
    } catch (err) {
      setError(apiErrorMessage(err, "Could not update the account."));
    } finally {
      setPending(false);
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/admin/finance/accounts", {
        method: "POST",
        body: JSON.stringify({
          code: accountForm.code,
          name: accountForm.name,
          accountType: accountForm.accountType,
          parentId: accountForm.parentId || undefined,
          description: accountForm.description || undefined,
        }),
      });
      setNotice("Account created.");
      router.refresh();
      setTimeout(close, 650);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not create the account. Check the highlighted details and try again."));
    } finally {
      setPending(false);
    }
  }

  async function recordEntry(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const amountUgx = Number(entryForm.amountUgx);
    try {
      if (!entryForm.debitAccountId || !entryForm.creditAccountId || !Number.isFinite(amountUgx) || amountUgx <= 0) {
        throw new Error("Pick both accounts and a positive amount.");
      }
      if (entryForm.debitAccountId === entryForm.creditAccountId) {
        throw new Error("The debit and credit accounts must be different.");
      }
      await api("/admin/finance/journal-entries", {
        method: "POST",
        body: JSON.stringify({
          entryDate: entryForm.entryDate,
          memo: entryForm.memo,
          lines: [
            { accountId: entryForm.debitAccountId, debitUgx: amountUgx, creditUgx: 0 },
            { accountId: entryForm.creditAccountId, debitUgx: 0, creditUgx: amountUgx },
          ],
        }),
      });
      setNotice("Journal entry recorded.");
      router.refresh();
      setTimeout(close, 650);
    } catch (err) {
      setError(err instanceof ApiError ? apiErrorMessage(err, "Could not record the entry.") : (err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {canManage && (
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3 dark:border-border">
          <button type="button" onClick={() => { setAccountForm(emptyAccountForm); setNotice(null); setError(null); setMode("create-account"); }} className={buttonClass("primary")}>
            <Plus aria-hidden className="size-4" />Add sub-account
          </button>
          <button type="button" onClick={() => { setEntryForm(emptyEntryForm); setNotice(null); setError(null); setMode("manual-entry"); }} className={buttonClass()}>
            <Plus aria-hidden className="size-4" />Record manual entry
          </button>
        </div>
      )}
      {error && !mode && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500 dark:bg-muted"><tr>
            {["Code", "Name", "Type", "Parent", "Status", ""].map((label) => <th key={label} className="px-4 py-3 font-bold uppercase tracking-[.06em]">{label}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-border">
            {accounts.map((account) => (
              <tr key={account.id} className="hover:bg-slate-50/80 dark:hover:bg-muted/30">
                <td className="px-4 py-3.5 font-bold dark:text-foreground">{account.code}</td>
                <td className="px-4 py-3.5 dark:text-foreground">{account.name}{account.isSystem && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-muted dark:text-muted-foreground">system</span>}</td>
                <td className="px-4 py-3.5 capitalize text-slate-500 dark:text-muted-foreground">{account.accountType}</td>
                <td className="px-4 py-3.5 text-slate-500 dark:text-muted-foreground">{account.parentId ? (byId.get(account.parentId)?.name ?? "—") : "—"}</td>
                <td className="px-4 py-3.5"><StatusBadge value={account.isActive ? "active" : "suspended"} /></td>
                <td className="px-4 py-3.5">
                  {canManage && !account.isSystem && (
                    <button type="button" disabled={pending} onClick={() => toggleActive(account)} className={buttonClass()}>
                      {account.isActive ? "Deactivate" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!accounts.length && <p className="py-14 text-center text-sm text-slate-500">No accounts yet.</p>}
      </div>

      <AdminModal open={mode === "create-account"} onClose={close} title="Add a sub-account" description="A sub-account under an existing parent must be the same account type.">
        <form onSubmit={createAccount} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Code" required><input required className={adminFieldClass} placeholder="5010" value={accountForm.code} onChange={(e) => setAccountForm((f) => ({ ...f, code: e.target.value }))} /></AdminField>
            <AdminField label="Name" required><input required className={adminFieldClass} placeholder="Cloud hosting" value={accountForm.name} onChange={(e) => setAccountForm((f) => ({ ...f, name: e.target.value }))} /></AdminField>
            <AdminField label="Type"><select className={adminFieldClass} value={accountForm.accountType} onChange={(e) => setAccountForm((f) => ({ ...f, accountType: e.target.value as LedgerAccountType }))}>{ACCOUNT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></AdminField>
            <AdminField label="Parent account" hint="Optional — must match the type above">
              <select className={adminFieldClass} value={accountForm.parentId} onChange={(e) => setAccountForm((f) => ({ ...f, parentId: e.target.value }))}>
                <option value="">No parent</option>
                {accounts.filter((a) => a.accountType === accountForm.accountType).map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </AdminField>
          </div>
          <AdminField label="Description"><textarea className={adminTextareaClass} value={accountForm.description} onChange={(e) => setAccountForm((f) => ({ ...f, description: e.target.value }))} /></AdminField>
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={buttonClass()} onClick={close}>Cancel</button><button disabled={pending} className={buttonClass("primary")}>{pending ? "Saving…" : "Save account"}</button></div>
        </form>
      </AdminModal>

      <AdminModal open={mode === "manual-entry"} onClose={close} title="Record a manual journal entry" description="A simple two-line entry: money moves from the debit account to the credit account.">
        <form onSubmit={recordEntry} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <AdminField label="Date" required><input required type="date" className={adminFieldClass} value={entryForm.entryDate} onChange={(e) => setEntryForm((f) => ({ ...f, entryDate: e.target.value }))} /></AdminField>
            <AdminField label="Amount (UGX)" required><input required type="number" min={1} step={1} className={adminFieldClass} value={entryForm.amountUgx} onChange={(e) => setEntryForm((f) => ({ ...f, amountUgx: e.target.value }))} /></AdminField>
            <AdminField label="Debit account" hint="Where the value is going" required>
              <select required className={adminFieldClass} value={entryForm.debitAccountId} onChange={(e) => setEntryForm((f) => ({ ...f, debitAccountId: e.target.value }))}>
                <option value="">Select account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </AdminField>
            <AdminField label="Credit account" hint="Where the value is coming from" required>
              <select required className={adminFieldClass} value={entryForm.creditAccountId} onChange={(e) => setEntryForm((f) => ({ ...f, creditAccountId: e.target.value }))}>
                <option value="">Select account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </select>
            </AdminField>
          </div>
          <AdminField label="Memo" required><input required className={adminFieldClass} placeholder="Office rent — August" value={entryForm.memo} onChange={(e) => setEntryForm((f) => ({ ...f, memo: e.target.value }))} /></AdminField>
          {error && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
          <div className="flex justify-end gap-2"><button type="button" className={buttonClass()} onClick={close}>Cancel</button><button disabled={pending} className={buttonClass("primary")}>{pending ? "Recording…" : "Record entry"}</button></div>
        </form>
      </AdminModal>
    </>
  );
}
