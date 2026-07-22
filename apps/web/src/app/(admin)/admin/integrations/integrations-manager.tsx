"use client";

import { ExternalLink, Link2, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminField, AdminModal, adminFieldClass, adminTextareaClass } from "@/components/admin/admin-modal";
import { StatusBadge } from "@/components/admin/admin-ui";
import { api } from "@/lib/api";

type Integration = { id: string | null; key: string; name: string; purpose: string; category: string; audience: string; baseUrl: string | null; enabled: boolean; configured: boolean; isSystem: boolean; config: Record<string, unknown> };
const empty = { key: "", name: "", purpose: "", category: "other", audience: "students", baseUrl: "", enabled: false };

export function IntegrationsManager({ rows, permissions }: { rows: Integration[]; permissions: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Integration | null>(null);
  const [form, setForm] = useState(empty);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const canAdd = permissions.includes("integrations.add");
  const canUpdate = permissions.includes("integrations.update");
  const canDelete = permissions.includes("integrations.delete");

  function start(item?: Integration) {
    setSelected(item ?? null); setForm(item ? { key: item.key, name: item.name, purpose: item.purpose, category: item.category, audience: item.audience, baseUrl: item.baseUrl ?? "", enabled: item.enabled } : empty); setNotice(null); setOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setNotice(null);
    try {
      const payload = { ...form, baseUrl: form.baseUrl || null, config: {} };
      if (selected?.id) await api(`/admin/integrations/${selected.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/admin/integrations", { method: "POST", body: JSON.stringify(payload) });
      setNotice("Integration saved. Student-facing links appear only when enabled."); router.refresh(); setTimeout(() => setOpen(false), 650);
    } catch { setNotice("Integration could not be saved. Keys must be unique and URLs must be valid HTTPS addresses."); } finally { setPending(false); }
  }
  async function toggle(item: Integration) {
    if (!item.id) return; setPending(true); setNotice(null);
    try { await api(`/admin/integrations/${item.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !item.enabled }) }); setNotice(`${item.name} ${item.enabled ? "disabled" : "enabled"}.`); router.refresh(); }
    catch { setNotice("Integration status could not be updated."); } finally { setPending(false); }
  }
  async function remove(item: Integration) {
    if (!item.id || !window.confirm(`Delete ${item.name}?`)) return; setPending(true);
    try { await api(`/admin/integrations/${item.id}`, { method: "DELETE" }); setNotice("Custom integration deleted."); router.refresh(); }
    catch { setNotice("System integrations can be disabled but cannot be deleted."); } finally { setPending(false); }
  }

  return <><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card"><div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row dark:border-border"><input className={`${adminFieldClass} flex-1`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search service, category, audience, or purpose…" />{canAdd && <button type="button" onClick={() => start()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white"><Plus className="size-4" />Add integration</button>}</div><div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <article key={`${item.key}-${item.id ?? "env"}`} className="flex flex-col rounded-xl border border-slate-200 p-4 dark:border-border"><div className="flex items-start gap-3"><span className="grid size-9 place-items-center rounded-lg bg-slate-100 text-teal-700 dark:bg-muted"><Link2 className="size-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold">{item.name}</h3><StatusBadge value={item.configured ? "configured" : "not configured"} /></div><p className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{item.category} · {item.audience}</p></div></div><p className="mt-3 flex-1 text-xs leading-relaxed text-slate-500">{item.purpose}</p>{item.baseUrl && <a href={item.baseUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-teal-700">Open service <ExternalLink className="size-3" /></a>}<div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-border"><span className={`text-[10px] font-bold uppercase ${item.enabled ? "text-emerald-700" : "text-slate-400"}`}>{item.enabled ? "Enabled" : "Disabled"}</span>{item.id && canUpdate && <><button type="button" onClick={() => toggle(item)} disabled={pending} title={item.enabled ? "Disable" : "Enable"} className="ml-auto grid size-8 place-items-center rounded-md border border-slate-200 dark:border-border"><Power className="size-3.5" /></button><button type="button" onClick={() => start(item)} title="Edit" className="grid size-8 place-items-center rounded-md border border-slate-200 dark:border-border"><Pencil className="size-3.5" /></button></>}{item.id && !item.isSystem && canDelete && <button type="button" onClick={() => remove(item)} title="Delete" className="grid size-8 place-items-center rounded-md border border-red-200 text-red-700 dark:border-red-900"><Trash2 className="size-3.5" /></button>}</div></article>)}</div>{!filtered.length && <p className="py-14 text-center text-sm text-slate-500">No integrations match this search.</p>}</section>{notice && <p role="status" className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">{notice}</p>}
    <AdminModal open={open} onClose={() => !pending && setOpen(false)} title={selected ? `Edit ${selected.name}` : "Add third-party integration"} description="Add approved services that support students, landlords, or internal operations. Secrets remain in the API environment, not this catalog."><form onSubmit={save} className="grid gap-4 p-5 sm:grid-cols-2"><AdminField label="Key"><input required disabled={Boolean(selected)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" className={adminFieldClass} value={form.key} onChange={(e) => setForm((current) => ({ ...current, key: e.target.value }))} placeholder="student-health" /></AdminField><AdminField label="Name"><input required className={adminFieldClass} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></AdminField><AdminField label="Category"><select className={adminFieldClass} value={form.category} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}>{["payments", "communications", "maps", "learning", "transport", "health", "safety", "analytics", "finance", "storage", "operations", "other"].map((item) => <option key={item}>{item}</option>)}</select></AdminField><AdminField label="Audience"><select className={adminFieldClass} value={form.audience} onChange={(e) => setForm((current) => ({ ...current, audience: e.target.value }))}>{["students", "landlords", "internal", "all"].map((item) => <option key={item}>{item}</option>)}</select></AdminField><div className="sm:col-span-2"><AdminField label="Service URL"><input type="url" className={adminFieldClass} value={form.baseUrl} onChange={(e) => setForm((current) => ({ ...current, baseUrl: e.target.value }))} placeholder="https://…" /></AdminField></div><div className="sm:col-span-2"><AdminField label="Purpose"><textarea required className={adminTextareaClass} value={form.purpose} onChange={(e) => setForm((current) => ({ ...current, purpose: e.target.value }))} /></AdminField></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((current) => ({ ...current, enabled: e.target.checked }))} />Enable immediately</label>{notice && <p className="text-xs text-amber-800 sm:col-span-2">{notice}</p>}<div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold dark:border-border">Cancel</button><button disabled={pending} className="h-10 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white">{pending ? "Saving…" : "Save integration"}</button></div></form></AdminModal>
  </>;
}
