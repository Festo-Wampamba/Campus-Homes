"use client";

import { KeyRound, Pencil, Plus, Search, ShieldCheck, Trash2, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminField, AdminModal, adminFieldClass, adminTextareaClass } from "@/components/admin/admin-modal";
import { StatusBadge } from "@/components/admin/admin-ui";
import { PaginationControls } from "@/components/pagination-controls";
import { PhoneField } from "@/components/phone-field";
import { PasswordInput } from "@/components/ui/password-input";
import { ViewToggle, type ViewMode } from "@/components/view-toggle";
import { api, ApiError, apiErrorMessage } from "@/lib/api";
import { usePagination } from "@/lib/use-pagination";

type UserRow = Record<string, unknown> & { id: string; name: string; email?: string | null; phone?: string | null; role: string; status: string; university?: string | null; assignments?: Assignment[] };
type Role = { key: string; name: string; description: string };
type Permission = { key: string; description: string; requiresStepUp: boolean };
type Property = { id: string; name: string; catchment: string };
type Assignment = { id: string; roleKey?: string; roleName?: string; key?: string; name?: string; scopeType: string; scopeId: string | null; reason?: string; validUntil?: string | null };
type DirectPermission = { id: string; permissionKey: string; description: string; scopeType: string; scopeId: string | null; reason: string };
type UserDetail = { user: Record<string, unknown> & { id: string; accountType: string; name: string; status: string }; assignments: Assignment[]; directPermissions: DirectPermission[]; memberships: { id: string; propertyName: string; role: string; workerType?: string | null; status: string }[] };

const ACCOUNT_TYPES = ["student", "landlord", "custodian", "property_worker", "ops_inspector", "ops_lead", "admin"];
const UNIVERSITIES = ["MUK", "MUBS", "KIU", "KYU", "other"];
const STUDY_YEARS = [1, 2, 3, 4, 5, 6];
const emptyUser = { name: "", email: "", phone: "", accountType: "student", status: "active", temporaryPassword: "", university: "MUK", yearOfStudy: "", legalName: "", dateOfBirth: "", gender: "", nationality: "Ugandan", address: "", emergencyContactName: "", emergencyContactPhone: "", notes: "" };

function buttonClass(tone: "primary" | "secondary" | "danger" = "secondary") {
  return `inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-45 ${tone === "primary" ? "bg-teal-600 text-white hover:bg-teal-700" : tone === "danger" ? "border border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950" : "border border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-border dark:text-foreground dark:hover:bg-muted"}`;
}

export function UsersManager({ rows, roles, permissions, properties, canMutate }: { rows: UserRow[]; roles: Role[]; permissions: Permission[]; properties: Property[]; canMutate: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");
  const [mode, setMode] = useState<"create" | "edit" | "access" | "delete" | null>(null);
  const [selected, setSelected] = useState<UserRow | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyUser);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [roleForm, setRoleForm] = useState({ roleKey: "student", scopeType: "own", scopeId: "", workerType: "general_worker", reason: "Operational access approved by Super Admin" });
  const [permissionForm, setPermissionForm] = useState({ permissionKey: permissions[0]?.key ?? "", scopeType: "platform_wide", scopeId: "", reason: "Direct exception approved by Super Admin" });
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.trim().toLowerCase())), [rows, query]);
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 10);

  function setField(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function close() { if (!pending) { setMode(null); setNotice(null); setFormError(null); setDetail(null); } }

  function startCreate() { setSelected(null); setForm(emptyUser); setNotice(null); setFormError(null); setMode("create"); }
  async function startDetail(row: UserRow, nextMode: "edit" | "access") {
    setSelected(row); setMode(nextMode); setPending(true); setNotice(null); setFormError(null);
    try {
      const data = await api<UserDetail>(`/admin/users/${row.id}`);
      setDetail(data);
      const u = data.user;
      setForm({
        ...emptyUser,
        name: String(u.name ?? ""), email: String(u.email ?? ""), phone: String(u.phone ?? ""),
        accountType: String(u.accountType ?? "student"), status: String(u.status ?? "active"),
        university: String(u.university ?? "MUK"), yearOfStudy: String(u.yearOfStudy ?? ""), legalName: String(u.legalName ?? ""),
        dateOfBirth: u.dateOfBirth ? String(u.dateOfBirth).slice(0, 10) : "", gender: ["male", "female"].includes(String(u.gender).toLowerCase()) ? String(u.gender).toLowerCase() : "", nationality: String(u.nationality ?? ""),
        address: String(u.address ?? ""), emergencyContactName: String(u.emergencyContactName ?? ""), emergencyContactPhone: String(u.emergencyContactPhone ?? ""), notes: String(u.notes ?? ""), temporaryPassword: "",
      });
    } catch { setNotice("Could not load this user record."); } finally { setPending(false); }
  }

  function payload(includePassword: boolean) {
    return {
      name: form.name, email: form.email || undefined, phone: form.phone || undefined,
      accountType: form.accountType, status: form.status,
      ...(includePassword && form.temporaryPassword ? { temporaryPassword: form.temporaryPassword } : {}),
      ...(form.accountType === "student" ? { university: form.university, yearOfStudy: form.yearOfStudy ? Number(form.yearOfStudy) : null } : {}),
      ...(form.accountType === "landlord" ? { legalName: form.legalName || form.name } : {}),
      dateOfBirth: form.dateOfBirth || null, gender: form.gender || null, nationality: form.nationality || null,
      address: form.address || null, emergencyContactName: form.emergencyContactName || null,
      emergencyContactPhone: form.emergencyContactPhone || null, notes: form.notes || null,
    };
  }

  async function saveUser(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setNotice(null); setFormError(null);
    try {
      if (mode === "create") await api("/admin/users", { method: "POST", body: JSON.stringify(payload(true)) });
      else if (selected) await api(`/admin/users/${selected.id}`, { method: "PATCH", body: JSON.stringify(payload(false)) });
      setNotice(mode === "create" ? "User created. Assign scoped access next." : "User information updated.");
      router.refresh();
      setTimeout(() => close(), 650);
    } catch (error) {
      setFormError(apiErrorMessage(error, "Could not save the user. Check the highlighted details and try again."));
    } finally { setPending(false); }
  }

  async function assignRole(event: React.FormEvent) {
    event.preventDefault(); if (!selected) return; setPending(true); setNotice(null);
    try {
      await api(`/admin/users/${selected.id}/roles`, { method: "POST", body: JSON.stringify({ ...roleForm, scopeId: ["platform_wide", "own"].includes(roleForm.scopeType) ? undefined : roleForm.scopeId, workerType: roleForm.roleKey === "property_worker" ? roleForm.workerType : undefined }) });
      const next = await api<UserDetail>(`/admin/users/${selected.id}`); setDetail(next); setNotice("Role and scoped access assigned."); router.refresh();
    } catch (error) { setNotice(error instanceof ApiError && error.status === 401 ? "Sign in again before this sensitive role change." : "Role assignment failed. Check scope and existing grants."); } finally { setPending(false); }
  }

  async function revokeRole(id: string) {
    if (!selected) return; setPending(true); setNotice(null);
    try { await api(`/admin/users/${selected.id}/roles/${id}`, { method: "DELETE" }); setDetail(await api<UserDetail>(`/admin/users/${selected.id}`)); setNotice("Role assignment revoked; history was preserved."); router.refresh(); }
    catch { setNotice("The role could not be revoked."); } finally { setPending(false); }
  }

  async function grantPermission(event: React.FormEvent) {
    event.preventDefault(); if (!selected || !permissionForm.permissionKey) return; setPending(true); setNotice(null);
    try {
      await api(`/admin/users/${selected.id}/permissions`, { method: "POST", body: JSON.stringify({ permissionKeys: [permissionForm.permissionKey], scopeType: permissionForm.scopeType, scopeId: ["platform_wide", "own"].includes(permissionForm.scopeType) ? undefined : permissionForm.scopeId, reason: permissionForm.reason }) });
      setDetail(await api<UserDetail>(`/admin/users/${selected.id}`)); setNotice("Direct permission exception granted and audited.");
    } catch { setNotice("Permission grant failed. It may already exist for that scope."); } finally { setPending(false); }
  }

  async function revokePermission(id: string) {
    if (!selected) return; setPending(true);
    try { await api(`/admin/users/${selected.id}/permissions/${id}`, { method: "DELETE" }); setDetail(await api<UserDetail>(`/admin/users/${selected.id}`)); setNotice("Direct permission revoked."); }
    catch { setNotice("Permission could not be revoked."); } finally { setPending(false); }
  }

  async function removeUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setPending(true); setNotice(null);
    const data = new FormData(event.currentTarget);
    try { await api(`/admin/users/${selected.id}`, { method: "DELETE", body: JSON.stringify({ reason: String(data.get("reason")) }) }); setNotice("User access revoked and account soft-deleted."); router.refresh(); setTimeout(() => close(), 700); }
    catch { setNotice("The user could not be deleted. The last Super Admin is protected."); } finally { setPending(false); }
  }

  const roleNeedsProperty = ["landlord", "custodian", "property_worker", "student"].includes(roleForm.roleKey) && roleForm.scopeType === "property";

  function rowAssignments(row: UserRow) {
    return row.assignments?.length ? <div className="flex flex-wrap gap-1">{row.assignments.map((assignment) => <span key={assignment.id ?? `${assignment.key}-${assignment.scopeId}`} className="rounded bg-slate-100 px-1.5 py-1 text-[10px] font-semibold dark:bg-muted">{assignment.name ?? assignment.key}{assignment.scopeId ? ` · ${properties.find((item) => item.id === assignment.scopeId)?.name ?? assignment.scopeId}` : ""}</span>)}</div> : <span className="text-slate-400 dark:text-muted-foreground">—</span>;
  }

  function rowActions(row: UserRow) {
    return <div className="flex gap-1">
      <button aria-label="Edit user" title="Edit particulars" onClick={() => startDetail(row, "edit")} className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-border dark:text-slate-300 dark:hover:border-teal-800 dark:hover:bg-teal-950 dark:hover:text-teal-200"><Pencil className="size-4" /></button>
      <button aria-label="Manage access" title="Roles and permissions" onClick={() => startDetail(row, "access")} className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-border dark:text-slate-300 dark:hover:border-violet-800 dark:hover:bg-violet-950 dark:hover:text-violet-200"><KeyRound className="size-4" /></button>
      {canMutate && <button aria-label="Delete user" title="Soft-delete user" onClick={() => { setSelected(row); setMode("delete"); setNotice(null); setFormError(null); }} className="grid size-10 place-items-center rounded-lg border border-red-200 text-red-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950 dark:hover:text-red-200"><Trash2 className="size-4" /></button>}
    </div>;
  }

  return <>
    <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row sm:items-center dark:border-border">
      <label className="relative min-w-0 flex-1"><span className="sr-only">Search users</span><Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className={`${adminFieldClass} pl-9`} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search name, email, phone, role, campus…" /></label>
      <div className="flex gap-2">
        <ViewToggle view={view} onChange={setView} />
        {canMutate && <button type="button" onClick={startCreate} className={buttonClass("primary")}><Plus aria-hidden className="size-4" />Add user</button>}
      </div>
    </div>

    {view === "list" && (
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-muted"><tr>{["User", "Contact", "Account type", "Staff / access roles", "Campus", "KYC", "Status", "Joined", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-bold uppercase tracking-[.06em]">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-border">{pageItems.map((row) =><tr key={row.id} className="hover:bg-slate-50/80 dark:hover:bg-muted/30"><td className="px-4 py-3.5 font-bold dark:text-foreground">{row.name || "Unnamed user"}</td><td className="px-4 py-3.5 text-slate-500 dark:text-muted-foreground"><span className="block">{row.email || "—"}</span><span className="block text-[10px]">{row.phone || "—"}</span></td><td className="px-4 py-3.5 capitalize dark:text-muted-foreground">{row.role.replaceAll("_", " ")}</td><td className="max-w-64 px-4 py-3.5">{rowAssignments(row)}</td><td className="px-4 py-3.5 dark:text-muted-foreground">{row.university ?? "—"}</td><td className="px-4 py-3.5"><StatusBadge value={row.kycStatus ?? "not applicable"} /></td><td className="px-4 py-3.5"><StatusBadge value={row.status} /></td><td className="px-4 py-3.5 text-slate-500 dark:text-muted-foreground">{row.createdAt ? new Date(String(row.createdAt)).toLocaleDateString() : "—"}</td><td className="px-4 py-3.5">{rowActions(row)}</td></tr>)}</tbody></table>{!filtered.length && <p className="py-14 text-center text-sm text-slate-500">No users match the current search.</p>}</div>
    )}

    {view === "rows" && (
      <div className="divide-y divide-slate-100 dark:divide-border">
        {pageItems.map((row) =><div key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-muted/30">
          <div className="min-w-0 flex-1">
            <p className="font-bold dark:text-foreground">{row.name || "Unnamed user"}</p>
            <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{row.email || row.phone || "—"} · <span className="capitalize">{row.role.replaceAll("_", " ")}</span>{row.university ? ` · ${row.university}` : ""}</p>
          </div>
          <StatusBadge value={row.kycStatus ?? "not applicable"} />
          <StatusBadge value={row.status} />
          {rowActions(row)}
        </div>)}
        {!filtered.length && <p className="py-14 text-center text-sm text-slate-500">No users match the current search.</p>}
      </div>
    )}

    {view === "grid" && (
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
        {pageItems.map((row) =><div key={row.id} className="rounded-lg border border-slate-200 p-3.5 dark:border-border">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate font-bold dark:text-foreground">{row.name || "Unnamed user"}</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-muted-foreground">{row.email || "—"}</p>
              <p className="text-[11px] text-slate-500 dark:text-muted-foreground">{row.phone || "—"}</p>
            </div>
            <StatusBadge value={row.status} />
          </div>
          <dl className="mb-2 space-y-1 text-xs">
            <div className="flex justify-between gap-2"><dt className="font-semibold uppercase tracking-[.04em] text-slate-400">Account type</dt><dd className="capitalize text-slate-600 dark:text-muted-foreground">{row.role.replaceAll("_", " ")}</dd></div>
            <div className="flex justify-between gap-2"><dt className="font-semibold uppercase tracking-[.04em] text-slate-400">Campus</dt><dd className="text-slate-600 dark:text-muted-foreground">{row.university ?? "—"}</dd></div>
            <div className="flex items-center justify-between gap-2"><dt className="font-semibold uppercase tracking-[.04em] text-slate-400">KYC</dt><dd><StatusBadge value={row.kycStatus ?? "not applicable"} /></dd></div>
          </dl>
          <div className="mb-3">{rowAssignments(row)}</div>
          {rowActions(row)}
        </div>)}
        {!filtered.length && <p className="col-span-full py-14 text-center text-sm text-slate-500">No users match the current search.</p>}
      </div>
    )}

    <PaginationControls page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />

    <AdminModal open={mode === "create" || mode === "edit"} onClose={close} title={mode === "create" ? "Add a CampusHomes user" : `Edit ${selected?.name ?? "user"}`} description="Identity and particulars are separate from role assignments and property access." wide>
      <form onSubmit={saveUser} className="space-y-5 p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <AdminField label="Full name" required>
            <input required autoComplete="name" className={adminFieldClass} placeholder="John Doe" value={form.name} onChange={(event) => setField("name", event.target.value)} />
          </AdminField>
          <AdminField label="Email">
            <input type="email" autoComplete="email" className={adminFieldClass} placeholder="john.doe@example.com" value={form.email} onChange={(event) => setField("email", event.target.value)} />
          </AdminField>
          <PhoneField key={`phone-${selected?.id ?? "new"}`} label="Phone" value={form.phone} onChange={(value) => setField("phone", value)} />
          <AdminField label="Account type">
            <select className={adminFieldClass} value={form.accountType} onChange={(event) => setField("accountType", event.target.value)}>{ACCOUNT_TYPES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
          </AdminField>
          <AdminField label="Status">
            <select className={adminFieldClass} value={form.status} onChange={(event) => setField("status", event.target.value)}>{["active", "pending", "suspended"].map((item) => <option key={item}>{item}</option>)}</select>
          </AdminField>
          {mode === "create" && <AdminField label="Temporary password" htmlFor="create-user-temporary-password" hint="Optional; minimum 16 characters and requires email.">
            <PasswordInput id="create-user-temporary-password" minLength={16} autoComplete="new-password" className={adminFieldClass} placeholder="At least 16 characters" value={form.temporaryPassword} onChange={(event) => setField("temporaryPassword", event.target.value)} />
          </AdminField>}
          {form.accountType === "student" && <>
            <AdminField label="University" required>
              <select required className={adminFieldClass} value={form.university} onChange={(event) => setField("university", event.target.value)}>{UNIVERSITIES.map((item) => <option key={item}>{item}</option>)}</select>
            </AdminField>
            <AdminField label="Year of study" required>
              <select required className={adminFieldClass} value={form.yearOfStudy} onChange={(event) => setField("yearOfStudy", event.target.value)}>
                <option value="">Select year</option>
                {STUDY_YEARS.map((year) => <option key={year} value={year}>{year}{year === 1 ? "st" : year === 2 ? "nd" : year === 3 ? "rd" : "th"} year</option>)}
              </select>
            </AdminField>
          </>}
          {form.accountType === "landlord" && <AdminField label="Legal / business name" required>
            <input required className={adminFieldClass} placeholder="Doe Student Homes Ltd" value={form.legalName} onChange={(event) => setField("legalName", event.target.value)} />
          </AdminField>}
        </div>
        <div className="border-t border-slate-100 pt-5 dark:border-border">
          <h3 className="mb-4 text-sm font-bold">Information and particulars</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <AdminField label="Date of birth"><input type="date" className={adminFieldClass} value={form.dateOfBirth} onChange={(event) => setField("dateOfBirth", event.target.value)} /></AdminField>
            <AdminField label="Gender">
              <select className={adminFieldClass} value={form.gender} onChange={(event) => setField("gender", event.target.value)}>
                <option value="">Select gender</option><option value="male">Male</option><option value="female">Female</option>
              </select>
            </AdminField>
            <AdminField label="Nationality"><input className={adminFieldClass} placeholder="Ugandan" value={form.nationality} onChange={(event) => setField("nationality", event.target.value)} /></AdminField>
            <AdminField label="Address"><input autoComplete="street-address" className={adminFieldClass} placeholder="Plot 12, Makerere Hill Road" value={form.address} onChange={(event) => setField("address", event.target.value)} /></AdminField>
            <AdminField label="Emergency contact"><input className={adminFieldClass} placeholder="Jane Doe" value={form.emergencyContactName} onChange={(event) => setField("emergencyContactName", event.target.value)} /></AdminField>
            <PhoneField key={`emergency-phone-${selected?.id ?? "new"}`} label="Emergency phone" value={form.emergencyContactPhone} onChange={(value) => setField("emergencyContactPhone", value)} />
          </div>
          <AdminField label="Administrative notes"><textarea className={`${adminTextareaClass} mt-4`} placeholder="Add internal context for the operations team…" value={form.notes} onChange={(event) => setField("notes", event.target.value)} /></AdminField>
        </div>
        {formError && <p role="alert" aria-live="assertive" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">{formError}</p>}
        {notice && <p role="status" aria-live="polite" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">{notice}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={buttonClass()} onClick={close}>Cancel</button><button disabled={pending} className={buttonClass("primary")}>{pending ? "Saving…" : "Save user"}</button></div>
      </form>
    </AdminModal>

    <AdminModal open={mode === "access"} onClose={close} title={`Access for ${selected?.name ?? "user"}`} description="Role permissions are combined with an explicit scope. Property access is never inferred from a role alone." wide>
      <div className="grid gap-5 p-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 p-4 dark:border-border"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="size-4 text-teal-700" /><h3 className="text-sm font-bold">Role assignments</h3></div><form onSubmit={assignRole} className="grid gap-3 sm:grid-cols-2"><AdminField label="Role"><select className={adminFieldClass} value={roleForm.roleKey} onChange={(e) => { const roleKey = e.target.value; const scopeType = ["landlord", "custodian", "property_worker"].includes(roleKey) ? "property" : roleKey === "student" ? "own" : "platform_wide"; setRoleForm((current) => ({ ...current, roleKey, scopeType })); }}>{roles.map((role) => <option key={role.key} value={role.key}>{role.name}</option>)}</select></AdminField><AdminField label="Scope"><select className={adminFieldClass} value={roleForm.scopeType} onChange={(e) => setRoleForm((current) => ({ ...current, scopeType: e.target.value }))}>{["platform_wide", "catchment", "property", "own"].map((scope) => <option key={scope} value={scope}>{scope.replaceAll("_", " ")}</option>)}</select></AdminField>{roleForm.scopeType === "property" && <AdminField label="Property" required><select required className={adminFieldClass} value={roleForm.scopeId} onChange={(e) => setRoleForm((current) => ({ ...current, scopeId: e.target.value }))}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name} · {property.catchment}</option>)}</select></AdminField>}{roleForm.scopeType === "catchment" && <AdminField label="Catchment"><select className={adminFieldClass} value={roleForm.scopeId} onChange={(e) => setRoleForm((current) => ({ ...current, scopeId: e.target.value }))}><option value="">Select catchment</option>{[...UNIVERSITIES.slice(0, 4), "all"].map((item) => <option key={item}>{item}</option>)}</select></AdminField>}{roleForm.roleKey === "property_worker" && <AdminField label="Worker type"><select className={adminFieldClass} value={roleForm.workerType} onChange={(e) => setRoleForm((current) => ({ ...current, workerType: e.target.value }))}>{["cleaner", "security_officer", "maintenance_worker", "general_worker"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField>}<div className="sm:col-span-2"><AdminField label="Reason" required><input required className={adminFieldClass} value={roleForm.reason} onChange={(e) => setRoleForm((current) => ({ ...current, reason: e.target.value }))} /></AdminField></div><button disabled={pending || (roleNeedsProperty && !roleForm.scopeId)} className={`${buttonClass("primary")} sm:col-span-2`}><Plus className="size-4" />Assign role</button></form><div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-border dark:border-border">{detail?.assignments.map((assignment) => <div key={assignment.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><p className="text-xs font-bold">{assignment.roleName}</p><p className="mt-1 text-[10px] text-slate-500">{assignment.scopeType.replaceAll("_", " ")}{assignment.scopeId ? ` · ${properties.find((item) => item.id === assignment.scopeId)?.name ?? assignment.scopeId}` : ""}</p></div><button type="button" onClick={() => revokeRole(assignment.id)} disabled={pending} className={buttonClass("danger")}>Revoke</button></div>)}</div></section>
        <section className="rounded-xl border border-slate-200 p-4 dark:border-border"><div className="mb-4 flex items-center gap-2"><UserRoundCog className="size-4 text-violet-700" /><h3 className="text-sm font-bold">Direct permission exceptions</h3></div><p className="mb-4 text-[11px] leading-relaxed text-slate-500">Use direct grants sparingly. Normal access should come from a role; every exception is audited and independently revocable.</p><form onSubmit={grantPermission} className="space-y-3"><AdminField label="Permission"><select className={adminFieldClass} value={permissionForm.permissionKey} onChange={(e) => setPermissionForm((current) => ({ ...current, permissionKey: e.target.value }))}>{permissions.map((permission) => <option key={permission.key} value={permission.key}>{permission.key}{permission.requiresStepUp ? " · step-up" : ""}</option>)}</select></AdminField><div className="grid gap-3 sm:grid-cols-2"><AdminField label="Scope"><select className={adminFieldClass} value={permissionForm.scopeType} onChange={(e) => setPermissionForm((current) => ({ ...current, scopeType: e.target.value }))}>{["platform_wide", "catchment", "property", "own"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField>{permissionForm.scopeType === "property" ? <AdminField label="Property"><select className={adminFieldClass} value={permissionForm.scopeId} onChange={(e) => setPermissionForm((current) => ({ ...current, scopeId: e.target.value }))}><option value="">Select property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></AdminField> : permissionForm.scopeType === "catchment" ? <AdminField label="Catchment"><select className={adminFieldClass} value={permissionForm.scopeId} onChange={(e) => setPermissionForm((current) => ({ ...current, scopeId: e.target.value }))}><option value="">Select catchment</option>{[...UNIVERSITIES.slice(0, 4), "all"].map((item) => <option key={item}>{item}</option>)}</select></AdminField> : null}</div><AdminField label="Reason" required><input required className={adminFieldClass} value={permissionForm.reason} onChange={(e) => setPermissionForm((current) => ({ ...current, reason: e.target.value }))} /></AdminField><button disabled={pending} className={buttonClass("primary")}><Plus className="size-4" />Grant permission</button></form><div className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-border">{detail?.directPermissions.map((permission) => <div key={permission.id} className="flex items-start gap-3 py-3"><div className="min-w-0 flex-1"><code className="text-[11px] font-bold">{permission.permissionKey}</code><p className="mt-1 text-[10px] text-slate-500">{permission.scopeType.replaceAll("_", " ")}{permission.scopeId ? ` · ${properties.find((item) => item.id === permission.scopeId)?.name ?? permission.scopeId}` : ""}</p></div><button type="button" onClick={() => revokePermission(permission.id)} disabled={pending} className={buttonClass("danger")}>Revoke</button></div>)}</div></section>
        {notice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 lg:col-span-2">{notice}</p>}
      </div>
    </AdminModal>

    <AdminModal open={mode === "delete"} onClose={close} title={`Delete ${selected?.name ?? "user"}?`} description="This is a recoverable soft-delete: sessions, roles, permissions, and property access are revoked while audit history remains."><form onSubmit={removeUser} className="space-y-4 p-5"><AdminField label="Deletion reason" required><textarea required minLength={3} name="reason" className={adminTextareaClass} placeholder="Why is this account being removed?" /></AdminField>{notice && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{notice}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={close} className={buttonClass()}>Cancel</button><button disabled={pending} className={buttonClass("danger")}><Trash2 className="size-4" />{pending ? "Deleting…" : "Revoke and delete"}</button></div></form></AdminModal>
  </>;
}
