"use client";

import { Check, ChevronRight, LockKeyhole, Save, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";

import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

interface RoleRow { id: string; key: string; name: string; description: string; isSystem: boolean; permissionCount: number; userCount: number }
interface PermissionRow { id: string; key: string; description: string; requiresStepUp: boolean }
interface RoleDetail extends RoleRow { permissionKeys: string[]; assignedUsers: { assignmentId: string; id: string; name: string; email: string | null; status: string; scopeType: string; scopeId: string | null; validUntil: string | null }[] }

const GROUP_LABELS: Record<string, string> = {
  staff: "Staff accounts", roles: "Roles & permissions", students: "Students", landlords: "Landlords",
  kyc_documents: "KYC documents", properties: "Properties", visits: "Verification visits", listings: "Listings",
  listing_versions: "Listing versions", reservations: "Reservations", payments: "Payments", refunds: "Refunds",
  disputes: "Disputes", strikes: "Trust & strikes", accounts: "Accounts", reviews: "Reviews", chat: "Chat",
  notifications: "Notifications", templates: "Templates", analytics: "Analytics", audit: "Audit log",
  semesters: "Semesters", universities: "Universities", settings: "Platform settings", integrations: "Integrations",
  users: "User lifecycle", property_units: "Property units", property_media: "Property media",
  custodians: "Custodians", workers: "Property workers", tasks: "Work orders", calendar: "Calendars",
  incidents: "Incidents", finance: "Property finance", reports: "Reports", service_requests: "Service requests",
  notices: "Property notices", evidence: "Evidence", issues: "Reported issues", units: "Units", move_in: "Move-in",
};

export function RolesManager({ roles, permissions, initialDetail, canEdit }: { roles: RoleRow[]; permissions: PermissionRow[]; initialDetail: RoleDetail; canEdit: boolean }) {
  const [selectedKey, setSelectedKey] = useState(initialDetail.key);
  const [detail, setDetail] = useState(initialDetail);
  const [selected, setSelected] = useState(new Set(initialDetail.permissionKeys));
  const [tab, setTab] = useState<"permissions" | "users">("permissions");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const locked = selectedKey === "super_admin" || !canEdit;
  const groups = useMemo(() => {
    const map = new Map<string, PermissionRow[]>();
    for (const permission of permissions) {
      const prefix = permission.key.split(".")[0]!;
      map.set(prefix, [...(map.get(prefix) ?? []), permission]);
    }
    return [...map.entries()];
  }, [permissions]);

  async function choose(role: RoleRow) {
    setSelectedKey(role.key); setNotice(null); setPending(true);
    try {
      const next = await api<RoleDetail>(`/admin/roles/${role.key}`);
      setDetail(next); setSelected(new Set(next.permissionKeys)); setTab("permissions");
    } catch { setNotice("Could not load this role."); } finally { setPending(false); }
  }

  function toggle(key: string) {
    if (locked) return;
    setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  }

  async function save() {
    setPending(true); setNotice(null);
    try {
      await api(`/admin/roles/${selectedKey}/permissions`, { method: "PATCH", body: JSON.stringify({ permissionKeys: [...selected] }) });
      setNotice("Permission changes saved and audited.");
    } catch (error) {
      setNotice(error instanceof ApiError && error.status === 401 ? "Sign in again to complete this sensitive change." : "The permission change could not be saved.");
    } finally { setPending(false); }
  }

  return <div className="grid min-h-[680px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card lg:grid-cols-[310px_minmax(0,1fr)]">
    <aside className="border-b border-slate-200 bg-slate-50/60 p-3 dark:border-border dark:bg-muted/30 lg:max-h-[850px] lg:overflow-y-auto lg:border-b-0 lg:border-r"><div className="mb-3 px-2"><p className="text-xs font-bold text-slate-900 dark:text-foreground">System roles</p><p className="mt-1 text-[11px] text-slate-500">{roles.length} roles · {permissions.length} permissions</p></div><div className="space-y-1">{roles.map((role) => <button key={role.key} type="button" onClick={() => choose(role)} className={cn("w-full rounded-lg border px-3 py-3 text-left transition-colors", role.key === selectedKey ? "border-teal-200 bg-white shadow-sm dark:border-teal-800 dark:bg-card" : "border-transparent hover:bg-white dark:hover:bg-card")}><span className="flex items-center gap-2"><span className={cn("grid size-8 place-items-center rounded-lg", role.key === selectedKey ? "bg-teal-100 text-teal-800" : "bg-slate-200/60 text-slate-500 dark:bg-muted")}><ShieldCheck aria-hidden className="size-4" /></span><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-900 dark:text-foreground">{role.name}</span><span className="block text-[10px] text-slate-500">{role.userCount} users · {role.permissionCount} grants</span></span><ChevronRight aria-hidden className="ml-auto size-3.5 text-slate-400" /></span></button>)}</div></aside>
    <div className={cn("min-w-0", pending && "opacity-80")}><div className="border-b border-slate-200 px-4 py-5 sm:px-6 dark:border-border"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#0b1f33] text-teal-300"><LockKeyhole aria-hidden className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{detail.name}</h2>{detail.isSystem && <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600 dark:bg-muted dark:text-muted-foreground">System role</span>}</div><p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-muted-foreground">{detail.description}</p><p className="mt-2 font-mono text-[11px] text-slate-400">Identifier: {detail.key}</p></div></div><div className="mt-5 flex gap-5 border-b border-slate-100 dark:border-border"><button type="button" onClick={() => setTab("permissions")} className={cn("border-b-2 pb-2 text-xs font-bold", tab === "permissions" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500")}>Permissions ({selected.size})</button><button type="button" onClick={() => setTab("users")} className={cn("border-b-2 pb-2 text-xs font-bold", tab === "users" ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500")}>Assigned users ({detail.assignedUsers.length})</button></div></div>
      {notice && <p role="status" className={cn("mx-4 mt-4 rounded-lg border px-3 py-2 text-xs sm:mx-6", notice.startsWith("Permission changes") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900")}>{notice}</p>}
      {tab === "permissions" ? <div className="p-4 sm:p-6"><div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-bold">Permission matrix</p><p className="mt-1 text-[11px] text-slate-500">High-risk grants require a fresh 15-minute sign-in window.</p></div><button type="button" onClick={save} disabled={locked || pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-45"><Save aria-hidden className="size-4" />Save changes</button></div>{locked && <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground"><LockKeyhole aria-hidden className="size-4" />{selectedKey === "super_admin" ? "Super Admin always receives the complete permission catalog." : "Your account has read-only access to this matrix."}</div>}<div className="grid gap-4 xl:grid-cols-2">{groups.map(([prefix, items]) => <section key={prefix} className="rounded-lg border border-slate-200 dark:border-border"><div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5 dark:border-border"><h3 className="text-xs font-bold">{GROUP_LABELS[prefix] ?? prefix.replaceAll("_", " ")}</h3><span className="text-[10px] font-semibold text-slate-400">{items.filter((item) => selected.has(item.key)).length}/{items.length}</span></div><div className="divide-y divide-slate-100 dark:divide-border">{items.map((permission) => <label key={permission.key} className={cn("flex gap-3 px-3 py-3", locked ? "cursor-default" : "cursor-pointer hover:bg-slate-50 dark:hover:bg-muted/30")}><input type="checkbox" className="sr-only" checked={selected.has(permission.key)} disabled={locked} onChange={() => toggle(permission.key)} /><span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded border", selected.has(permission.key) ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white dark:border-border dark:bg-background")}>{selected.has(permission.key) && <Check aria-hidden className="size-3" />}</span><span className="min-w-0"><span className="flex flex-wrap items-center gap-1.5"><code className="text-[11px] font-bold text-slate-700 dark:text-foreground">{permission.key}</code>{permission.requiresStepUp && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:bg-amber-950">Step-up</span>}</span><span className="mt-1 block text-[10px] leading-relaxed text-slate-500">{permission.description}</span></span></label>)}</div></section>)}</div></div> : <div className="p-4 sm:p-6"><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-border"><table className="w-full min-w-max text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-muted"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Scope</th><th className="px-4 py-3">Valid until</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-border">{detail.assignedUsers.map((user) => <tr key={user.assignmentId}><td className="px-4 py-3"><span className="flex items-center gap-2"><UserRound aria-hidden className="size-4 text-slate-400" /><span><span className="block font-bold">{user.name || "Unnamed user"}</span><span className="text-[10px] text-slate-500">{user.email ?? "No email"}</span></span></span></td><td className="px-4 py-3 capitalize">{user.status}</td><td className="px-4 py-3">{user.scopeType.replaceAll("_", " ")}{user.scopeId ? ` · ${user.scopeId}` : ""}</td><td className="px-4 py-3">{user.validUntil ? new Date(user.validUntil).toLocaleDateString() : "No expiry"}</td></tr>)}</tbody></table>{!detail.assignedUsers.length && <p className="py-12 text-center text-sm text-slate-500">No active users hold this role.</p>}</div></div>}
    </div>
  </div>;
}
