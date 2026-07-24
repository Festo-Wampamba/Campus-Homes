/* eslint-disable @next/next/no-img-element -- Cloudinary URLs are already transformed by listingPhotoUrl. */
"use client";

import { Building2, ImagePlus, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AdminField, AdminModal, adminFieldClass, adminTextareaClass } from "@/components/admin/admin-modal";
import { StatusBadge } from "@/components/admin/admin-ui";
import { api, apiErrorMessage } from "@/lib/api";
import { listingPhotoUrl, uploadToCloudinary, type CloudinarySignature } from "@/lib/cloudinary";

type PropertyRow = Record<string, unknown> & { id: string; name: string; landlordName: string; catchment: string; type: string; status: string; operationalStatus: string; unitCount: number; availableUnits: number; imageCount: number };
type Landlord = { id: string; name: string; email?: string | null; role: string };
type Semester = { id: string; name: string; university?: string | null; semesterType?: string | null; academicYear?: string | null; startsOn: string; endsOn: string };
type UnitDraft = { label: string; capacity: string; roomCategory: string; pricePerTermUgx: string; operationalStatus: string; buildingName: string; floorLabel: string; electricityMeterType: string; notes: string };
type PropertyDetail = { property: Record<string, unknown> & { id: string; landlordId: string; name: string; streetAddress: string; type: string; catchment: string; operationalStatus: string }; media: { id: string; storageKey: string; mediaType: string; caption?: string | null }[]; units: (UnitDraft & { id: string; pricePerTermUgx: number; capacity: number })[]; memberships: { id: string; name: string; role: string; workerType?: string | null; status: string }[] };

const TYPES = ["hostel", "apartment", "hall", "boarding_house", "shared_house", "studio", "other"];
const CATCHMENTS = ["MUK", "MUBS", "KIU", "KYU", "other"];
const ROOM_TYPES = ["single", "double", "triple", "quad", "studio", "self_contained", "bedsitter", "dormitory", "other"];
const AMENITIES = ["wifi", "parking", "security", "cctv", "study_area", "laundry", "kitchen", "furnished", "wheelchair_access", "backup_power", "water_tank", "recreation_area"];
const emptyUnit = (): UnitDraft => ({ label: "", capacity: "1", roomCategory: "single", pricePerTermUgx: "", operationalStatus: "available", buildingName: "", floorLabel: "", electricityMeterType: "included", notes: "" });
const emptyForm = { landlordId: "", name: "", streetAddress: "", type: "hostel", catchment: "MUK", description: "", operationalStatus: "open", contactPhone: "", contactEmail: "", houseRules: "", semesterId: "", water: "included", electricity: "included", internet: "included", wasteCollection: "included" };
const fieldButton = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold hover:bg-slate-50 disabled:opacity-45 dark:border-border dark:hover:bg-muted";

export function PropertiesManager({ rows, landlords, semesters, permissions }: { rows: PropertyRow[]; landlords: Landlord[]; semesters: Semester[]; permissions: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"create" | "edit" | "detail" | null>(null);
  const [selected, setSelected] = useState<PropertyRow | null>(null);
  const [detail, setDetail] = useState<PropertyDetail | null>(null);
  const [form, setForm] = useState<Record<string, string>>(emptyForm);
  const [amenities, setAmenities] = useState<Record<string, boolean>>({});
  const [units, setUnits] = useState<UnitDraft[]>([emptyUnit()]);
  const [imageUrls, setImageUrls] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const filtered = useMemo(() => rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query.toLowerCase())), [rows, query]);
  const applicableSemesters = useMemo(() => semesters.filter((semester) => !semester.university || semester.university === form.catchment), [semesters, form.catchment]);
  const canCreate = permissions.includes("properties.create");
  const canUpdate = permissions.includes("properties.update");
  const canManageUnits = permissions.includes("property_units.manage");
  // A landlord's own existing properties are the closest thing to "the
  // landlord's university" the data model has — no MUK-only default.
  const landlordCatchments = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) if (!map.has(row.landlordName)) map.set(row.landlordName, row.catchment);
    return map;
  }, [rows]);
  // Falls back to whichever catchment actually has a semester configured,
  // so a brand-new landlord never lands on a dead "no applicable semesters" field.
  const fallbackCatchment = useMemo(() => semesters.find((s) => s.university)?.university ?? CATCHMENTS[0], [semesters]);
  function defaultCatchmentFor(landlordId: string): string {
    const landlordName = landlords.find((landlord) => landlord.id === landlordId)?.name;
    return (landlordName && landlordCatchments.get(landlordName)) || fallbackCatchment;
  }

  function setField(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function setCatchment(value: string) {
    const firstApplicable = semesters.find((semester) => !semester.university || semester.university === value);
    setForm((current) => ({ ...current, catchment: value, semesterId: firstApplicable?.id ?? "" }));
  }
  function setLandlord(landlordId: string) {
    const catchment = defaultCatchmentFor(landlordId);
    const firstApplicable = semesters.find((semester) => !semester.university || semester.university === catchment);
    setForm((current) => ({ ...current, landlordId, catchment, semesterId: firstApplicable?.id ?? "" }));
  }
  function close() { if (!pending) { setMode(null); setSelected(null); setDetail(null); setNotice(null); } }
  function startCreate() {
    const landlordId = landlords[0]?.id ?? "";
    const catchment = defaultCatchmentFor(landlordId);
    const firstSemester = semesters.find((semester) => !semester.university || semester.university === catchment);
    setForm({ ...emptyForm, landlordId, catchment, semesterId: firstSemester?.id ?? "" });
    setAmenities({}); setUnits([emptyUnit()]); setImageUrls(""); setImageFiles([]); setNotice(null); setMode("create");
  }

  async function load(row: PropertyRow, nextMode: "edit" | "detail") {
    setSelected(row); setMode(nextMode); setPending(true); setNotice(null);
    try {
      const data = await api<PropertyDetail>(`/admin/properties/${row.id}`); setDetail(data);
      const p = data.property;
      const propertyCatchment = String(p.catchment ?? "MUK");
      const firstSemester = semesters.find((semester) => !semester.university || semester.university === propertyCatchment);
      setForm({ ...emptyForm, landlordId: String(p.landlordId ?? ""), name: String(p.name ?? ""), streetAddress: String(p.streetAddress ?? ""), type: String(p.type ?? "hostel"), catchment: propertyCatchment, description: String(p.description ?? ""), operationalStatus: String(p.operationalStatus ?? "open"), contactPhone: String(p.contactPhone ?? ""), contactEmail: String(p.contactEmail ?? ""), houseRules: Array.isArray(p.houseRules) ? p.houseRules.join("\n") : "", semesterId: firstSemester?.id ?? "", water: String((p.utilities as Record<string, unknown> | undefined)?.water ?? "included"), electricity: String((p.utilities as Record<string, unknown> | undefined)?.electricity ?? "included"), internet: String((p.utilities as Record<string, unknown> | undefined)?.internet ?? "included"), wasteCollection: String((p.utilities as Record<string, unknown> | undefined)?.wasteCollection ?? "included") });
      setAmenities((p.amenities as Record<string, boolean>) ?? {}); setUnits([emptyUnit()]); setImageUrls(""); setImageFiles([]);
    } catch { setNotice("Property details could not be loaded."); } finally { setPending(false); }
  }

  function updateUnit(index: number, key: keyof UnitDraft, value: string) { setUnits((current) => current.map((unit, position) => position === index ? { ...unit, [key]: value } : unit)); }
  async function uploadImages(): Promise<string[]> {
    const keys = imageUrls.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    for (const file of imageFiles) {
      const signature = await api<CloudinarySignature>("/uploads/sign", { method: "POST" });
      keys.push((await uploadToCloudinary(file, signature)).publicId);
    }
    return keys;
  }

  const basePayload = () => ({
    landlordId: form.landlordId, name: form.name, streetAddress: form.streetAddress,
    type: form.type, catchment: form.catchment, description: form.description || null,
    operationalStatus: form.operationalStatus, amenities,
    utilities: { water: form.water, electricity: form.electricity, internet: form.internet, wasteCollection: form.wasteCollection },
    houseRules: form.houseRules.split("\n").map((item) => item.trim()).filter(Boolean),
    contactPhone: form.contactPhone || null, contactEmail: form.contactEmail || null,
  });
  const unitPayload = () => units.filter((unit) => unit.label && unit.pricePerTermUgx).map((unit) => ({ ...unit, capacity: Number(unit.capacity), pricePerTermUgx: Number(unit.pricePerTermUgx), buildingName: unit.buildingName || null, floorLabel: unit.floorLabel || null, electricityMeterType: unit.electricityMeterType || null, notes: unit.notes || null, amenities: {} }));

  async function save(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setNotice(null);
    try {
      if (mode === "create") {
        const imageKeys = await uploadImages();
        await api("/admin/properties", { method: "POST", body: JSON.stringify({ ...basePayload(), imageKeys, coverPhotoKey: imageKeys[0] ?? null, semesterId: unitPayload().length ? form.semesterId : undefined, units: unitPayload() }) });
        setNotice("Property, images, utilities, and initial units were created.");
      } else if (selected) {
        await api(`/admin/properties/${selected.id}`, { method: "PATCH", body: JSON.stringify(basePayload()) });
        const imageKeys = await uploadImages();
        if (imageKeys.length) await api(`/admin/properties/${selected.id}/media`, { method: "POST", body: JSON.stringify({ mediaType: "image", items: imageKeys.map((storageKey) => ({ storageKey })) }) });
        if (unitPayload().length) await api(`/admin/properties/${selected.id}/units`, { method: "POST", body: JSON.stringify({ semesterId: form.semesterId, units: unitPayload() }) });
        setNotice("Property operations, media, and inventory were updated.");
      }
      router.refresh(); setTimeout(() => close(), 800);
    } catch (error) { setNotice(apiErrorMessage(error, "Property save failed. Check the owner, applicable semester, units, and image connection.")); }
    finally { setPending(false); }
  }

  async function removeMedia(mediaId: string) {
    if (!selected) return; setPending(true);
    try { await api(`/admin/properties/${selected.id}/media/${mediaId}`, { method: "DELETE" }); setDetail(await api<PropertyDetail>(`/admin/properties/${selected.id}`)); setNotice("Media removed from this property."); router.refresh(); }
    catch { setNotice("Media could not be removed."); } finally { setPending(false); }
  }

  return <>
    <div className="flex flex-col gap-3 border-b border-slate-200 p-3 sm:flex-row dark:border-border"><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><input className={`${adminFieldClass} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search property, landlord, catchment, type, status…" /></label>{canCreate && <button type="button" onClick={startCreate} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700"><Plus className="size-4" />Add property</button>}</div>
    <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-xs"><thead className="bg-slate-50 text-slate-500 dark:bg-muted"><tr>{["Property", "Owner", "Type", "Catchment", "Verification", "Operations", "Units", "Available", "Media", "Actions"].map((label) => <th key={label} className="px-4 py-3 font-bold uppercase tracking-[.06em]">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-border">{filtered.map((row) => <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-muted/30"><td className="px-4 py-3.5 font-bold">{row.name}</td><td className="px-4 py-3.5">{row.landlordName}</td><td className="px-4 py-3.5 capitalize">{row.type?.replaceAll("_", " ")}</td><td className="px-4 py-3.5">{row.catchment}</td><td className="px-4 py-3.5"><StatusBadge value={row.status} /></td><td className="px-4 py-3.5"><StatusBadge value={row.operationalStatus} /></td><td className="px-4 py-3.5 font-bold">{row.unitCount ?? 0}</td><td className="px-4 py-3.5">{row.availableUnits ?? 0}</td><td className="px-4 py-3.5">{row.imageCount ?? 0}</td><td className="px-4 py-3.5"><div className="flex gap-1"><button aria-label="View property inventory" title="View inventory" onClick={() => load(row, "detail")} className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-border dark:text-slate-300 dark:hover:border-teal-800 dark:hover:bg-teal-950 dark:hover:text-teal-200"><Building2 className="size-4" /></button>{canUpdate && <button aria-label="Edit property" title="Edit property" onClick={() => load(row, "edit")} className="grid size-10 place-items-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-600 dark:border-border dark:text-slate-300 dark:hover:border-violet-800 dark:hover:bg-violet-950 dark:hover:text-violet-200"><Pencil className="size-4" /></button>}</div></td></tr>)}</tbody></table>{!filtered.length && <p className="py-14 text-center text-sm text-slate-500">No properties match this search.</p>}</div>

    <AdminModal open={mode === "create" || mode === "edit"} onClose={close} title={mode === "create" ? "Add a property" : `Update ${selected?.name ?? "property"}`} description="Create the property record, operational utilities, media, and room inventory without changing Ops-controlled verification or publication status." wide>
      <form onSubmit={save} className="space-y-6 p-5"><div className="grid gap-4 md:grid-cols-3"><AdminField label="Landlord / owner" required><select required className={adminFieldClass} value={form.landlordId} onChange={(e) => setLandlord(e.target.value)}><option value="">Select owner</option>{landlords.map((landlord) => <option key={landlord.id} value={landlord.id}>{landlord.name} · {landlord.email}</option>)}</select></AdminField><AdminField label="Property name" required><input required className={adminFieldClass} placeholder="Makerere View Hostel" value={form.name} onChange={(e) => setField("name", e.target.value)} /></AdminField><AdminField label="Property type"><select className={adminFieldClass} value={form.type} onChange={(e) => setField("type", e.target.value)}>{TYPES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField><div className="md:col-span-2"><AdminField label="Street address" required><input required className={adminFieldClass} placeholder="Plot 12, Makerere Hill Road" value={form.streetAddress} onChange={(e) => setField("streetAddress", e.target.value)} /></AdminField></div><AdminField label="University catchment"><select className={adminFieldClass} value={form.catchment} onChange={(e) => setCatchment(e.target.value)}>{CATCHMENTS.map((item) => <option key={item}>{item}</option>)}</select></AdminField><AdminField label="Operational status"><select className={adminFieldClass} value={form.operationalStatus} onChange={(e) => setField("operationalStatus", e.target.value)}>{["open", "temporarily_closed", "under_renovation", "emergency_closure"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField><AdminField label="Contact phone"><input type="tel" inputMode="tel" className={adminFieldClass} placeholder="+256 771 234 567" value={form.contactPhone} onChange={(e) => setField("contactPhone", e.target.value)} /></AdminField><AdminField label="Contact email"><input type="email" className={adminFieldClass} placeholder="manager@example.com" value={form.contactEmail} onChange={(e) => setField("contactEmail", e.target.value)} /></AdminField></div><AdminField label="Description"><textarea className={adminTextareaClass} placeholder="Describe the location, rooms, access, and notable facilities…" value={form.description} onChange={(e) => setField("description", e.target.value)} /></AdminField>
        <section className="rounded-xl border border-slate-200 p-4 dark:border-border"><h3 className="text-sm font-bold">Amenities and utilities</h3><div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">{AMENITIES.map((item) => <label key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-muted"><input type="checkbox" checked={amenities[item] ?? false} onChange={(e) => setAmenities((current) => ({ ...current, [item]: e.target.checked }))} />{item.replaceAll("_", " ")}</label>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-4">{[["water", "Water"], ["electricity", "Electricity"], ["internet", "Internet"], ["wasteCollection", "Waste collection"]].map(([key, label]) => <AdminField key={key} label={label}><select className={adminFieldClass} value={form[key]} onChange={(e) => setField(key, e.target.value)}>{["included", "metered", "prepaid", "shared", "not_available"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField>)}</div></section>
        <section className="grid gap-4 rounded-xl border border-slate-200 p-4 dark:border-border md:grid-cols-2"><AdminField label="Property images" hint="Select files for Cloudinary; existing URLs/public IDs can also be entered."><input type="file" multiple accept="image/*" className={adminFieldClass} onChange={(e) => setImageFiles(Array.from(e.target.files ?? []))} /></AdminField><AdminField label="Image URLs or storage keys" hint="One per line."><textarea className={adminTextareaClass} value={imageUrls} onChange={(e) => setImageUrls(e.target.value)} /></AdminField><div className="md:col-span-2"><AdminField label="House rules" hint="One rule per line."><textarea className={adminTextareaClass} value={form.houseRules} onChange={(e) => setField("houseRules", e.target.value)} /></AdminField></div></section>
        {canManageUnits && <section className="rounded-xl border border-slate-200 p-4 dark:border-border"><div className="flex items-center justify-between"><div><h3 className="text-sm font-bold">Room and unit inventory</h3><p className="mt-1 text-[11px] text-slate-500">Label, building, type, capacity, term price, electricity, and operating status.</p></div><button type="button" className={fieldButton} onClick={() => setUnits((current) => [...current, emptyUnit()])}><Plus className="size-3.5" />Add unit</button></div><div className="mt-4"><AdminField label={`Semester for ${form.catchment}`} required={unitPayload().length > 0} hint={!applicableSemesters.length ? `No semester is configured for ${form.catchment}. Add Semester 1 or 2 under Platform settings, or pick a different university catchment above.` : "Only semesters configured for this property's university are shown."}><select required={unitPayload().length > 0} className={adminFieldClass} value={form.semesterId} onChange={(e) => setField("semesterId", e.target.value)}><option value="">{applicableSemesters.length ? "Select semester" : "No applicable semesters"}</option>{applicableSemesters.map((semester) => <option key={semester.id} value={semester.id}>{semester.name}</option>)}</select></AdminField></div><div className="mt-4 space-y-3">{units.map((unit, index) => <div key={index} className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2 lg:grid-cols-4 dark:bg-muted/50"><AdminField label="Unit label"><input className={adminFieldClass} value={unit.label} onChange={(e) => updateUnit(index, "label", e.target.value)} placeholder="Room 2A / Bed 1" /></AdminField><AdminField label="Building / block"><input className={adminFieldClass} placeholder="Block A" value={unit.buildingName} onChange={(e) => updateUnit(index, "buildingName", e.target.value)} /></AdminField><AdminField label="Floor"><input className={adminFieldClass} placeholder="2nd floor" value={unit.floorLabel} onChange={(e) => updateUnit(index, "floorLabel", e.target.value)} /></AdminField><AdminField label="Room type"><select className={adminFieldClass} value={unit.roomCategory} onChange={(e) => updateUnit(index, "roomCategory", e.target.value)}>{ROOM_TYPES.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField><AdminField label="Capacity"><input type="number" min={1} max={50} className={adminFieldClass} value={unit.capacity} onChange={(e) => updateUnit(index, "capacity", e.target.value)} /></AdminField><AdminField label="Price per term (UGX)"><input type="number" min={1} className={adminFieldClass} placeholder="1500000" value={unit.pricePerTermUgx} onChange={(e) => updateUnit(index, "pricePerTermUgx", e.target.value)} /></AdminField><AdminField label="Unit status"><select className={adminFieldClass} value={unit.operationalStatus} onChange={(e) => updateUnit(index, "operationalStatus", e.target.value)}>{["available", "vacant", "occupied", "held", "under_maintenance", "blocked"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></AdminField><div className="flex items-end gap-2"><AdminField label="Electricity"><select className={adminFieldClass} value={unit.electricityMeterType} onChange={(e) => updateUnit(index, "electricityMeterType", e.target.value)}>{["included", "prepaid", "postpaid", "shared", "none"].map((item) => <option key={item}>{item}</option>)}</select></AdminField>{units.length > 1 && <button type="button" aria-label="Remove unit row" onClick={() => setUnits((current) => current.filter((_, position) => position !== index))} className="mb-0.5 grid size-10 place-items-center rounded-lg text-red-700 transition-colors hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950"><Trash2 className="size-4" /></button>}</div></div>)}</div></section>}
        {notice && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={close} className={fieldButton}>Cancel</button><button disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white disabled:opacity-45"><ImagePlus className="size-4" />{pending ? "Saving…" : "Save property"}</button></div></form>
    </AdminModal>

    <AdminModal open={mode === "detail"} onClose={close} title={selected?.name ?? "Property inventory"} description="Operational inventory and scoped property team." wide><div className="space-y-5 p-5">{notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{notice}</p>}<section><h3 className="mb-3 text-sm font-bold">Property media</h3><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">{detail?.media.map((item) => { const url = listingPhotoUrl(item.storageKey, 400); return <div key={item.id} className="overflow-hidden rounded-lg border border-slate-200 dark:border-border">{url ? <img src={url} alt={item.caption ?? "Property media"} className="h-28 w-full object-cover" /> : <div className="grid h-28 place-items-center bg-slate-100 text-xs text-slate-500 dark:bg-muted">{item.mediaType}</div>}<div className="flex items-center gap-2 p-2"><span className="min-w-0 flex-1 truncate text-[10px]">{item.caption || item.storageKey}</span>{canUpdate && <button title="Remove media" onClick={() => removeMedia(item.id)} className="text-red-700"><Trash2 className="size-3.5" /></button>}</div></div>; })}{!detail?.media.length && <p className="text-xs text-slate-500">No supplementary media.</p>}</div></section><section><h3 className="mb-3 text-sm font-bold">Units ({detail?.units.length ?? 0})</h3><div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-border"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-slate-50 dark:bg-muted"><tr>{["Unit", "Building", "Floor", "Type", "Capacity", "Price / term", "Electricity", "Status"].map((item) => <th key={item} className="px-3 py-2">{item}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-border">{detail?.units.map((unit) => <tr key={unit.id}><td className="px-3 py-2 font-bold">{unit.label}</td><td className="px-3 py-2">{unit.buildingName || "—"}</td><td className="px-3 py-2">{unit.floorLabel || "—"}</td><td className="px-3 py-2 capitalize">{unit.roomCategory.replaceAll("_", " ")}</td><td className="px-3 py-2">{unit.capacity}</td><td className="px-3 py-2">UGX {Number(unit.pricePerTermUgx).toLocaleString()}</td><td className="px-3 py-2">{unit.electricityMeterType || "—"}</td><td className="px-3 py-2"><StatusBadge value={unit.operationalStatus} /></td></tr>)}</tbody></table></div></section><section><h3 className="mb-3 text-sm font-bold">Scoped property team</h3><div className="grid gap-2 sm:grid-cols-2">{detail?.memberships.map((member) => <div key={member.id} className="rounded-lg border border-slate-200 p-3 text-xs dark:border-border"><p className="font-bold">{member.name}</p><p className="mt-1 capitalize text-slate-500">{member.role.replaceAll("_", " ")}{member.workerType ? ` · ${member.workerType.replaceAll("_", " ")}` : ""}</p></div>)}</div></section></div></AdminModal>
  </>;
}
