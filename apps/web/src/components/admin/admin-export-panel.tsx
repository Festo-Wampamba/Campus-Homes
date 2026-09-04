"use client";

import { BarChart3, Download, FileSpreadsheet, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { AdminField, adminFieldClass } from "./admin-modal";

// Relative, not absolute — see lib/api.ts's BASE for why.
const API_BASE = "";

const LABELS: Record<string, string> = {
  platform: "Platform summary", catchments: "Catchment performance", users: "Users",
  properties: "Properties", reservations: "Reservations", finance: "Financial activity",
  verifications: "Verification and KYC",
};

export function AdminExportPanel({
  endpoint = "/admin/reports/export",
  reportTypes,
  fixedReportType,
}: {
  endpoint?: string;
  reportTypes?: string[];
  fixedReportType?: string;
}) {
  const choices = reportTypes ?? ["platform", "catchments", "users", "properties", "reservations", "finance", "verifications"];
  const [reportType, setReportType] = useState(fixedReportType ?? choices[0] ?? "platform");
  const [format, setFormat] = useState("xlsx");
  const [destination, setDestination] = useState("download");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [catchment, setCatchment] = useState("all");
  const [statuses, setStatuses] = useState("");
  const [includePii, setIncludePii] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setPending(true); setNotice(null);
    try {
      const response = await fetch(`${API_BASE}/api/v1${endpoint}`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportType, format, destination, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, catchment, statuses: statuses.split(",").map((item) => item.trim()).filter(Boolean), includePersonallyIdentifiableInformation: includePii }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(error?.message ?? `Export failed with status ${response.status}`);
      }
      if (destination === "power_bi") {
        const result = await response.json() as { rowCount: number };
        setNotice(`Published ${result.rowCount} governed rows to Power BI.`);
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const fileName = disposition.match(/filename="([^"]+)"/)?.[1] ?? `campushomes-${reportType}.${destination === "financial_model" ? "xlsx" : format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.click(); URL.revokeObjectURL(url);
      setNotice(`Generated ${fileName}. The export was recorded in the audit history.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The export could not be generated."); }
    finally { setPending(false); }
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-border dark:bg-card sm:p-5">
    <div className="flex items-start gap-3"><span className="grid size-10 place-items-center rounded-xl bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"><BarChart3 className="size-5" /></span><div><h2 className="text-sm font-bold">Generate or publish</h2><p className="mt-1 text-xs text-slate-500">Filter source-backed records, choose a document format, or publish a governed dataset.</p></div></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{!fixedReportType && <AdminField label="Report"><select className={adminFieldClass} value={reportType} onChange={(e) => setReportType(e.target.value)}>{choices.map((item) => <option key={item} value={item}>{LABELS[item] ?? item}</option>)}</select></AdminField>}<AdminField label="Destination"><select className={adminFieldClass} value={destination} onChange={(e) => setDestination(e.target.value)}><option value="download">Download</option><option value="financial_model">Financial analysis workbook</option><option value="power_bi">Publish to Power BI</option></select></AdminField><AdminField label="Format"><select disabled={destination !== "download"} className={adminFieldClass} value={format} onChange={(e) => setFormat(e.target.value)}>{["xlsx", "pdf", "docx", "pptx", "csv", "json"].map((item) => <option key={item} value={item}>{item.toUpperCase()}</option>)}</select></AdminField><AdminField label="Catchment"><select className={adminFieldClass} value={catchment} onChange={(e) => setCatchment(e.target.value)}>{["all", "MUK", "MUBS", "KIU", "KYU", "other"].map((item) => <option key={item}>{item}</option>)}</select></AdminField><AdminField label="Date from"><input type="date" className={adminFieldClass} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></AdminField><AdminField label="Date to"><input type="date" className={adminFieldClass} value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></AdminField><AdminField label="Statuses" hint="Optional, comma-separated values."><input className={adminFieldClass} value={statuses} onChange={(e) => setStatuses(e.target.value)} placeholder="active, pending" /></AdminField><label className="flex min-h-10 items-center gap-2 self-end rounded-lg border border-slate-200 px-3 text-xs dark:border-border"><input type="checkbox" checked={includePii} onChange={(e) => setIncludePii(e.target.checked)} /><span><span className="block font-bold">Include personal data</span><span className="text-[10px] text-slate-500">Requires the sensitive export permission.</span></span></label></div>
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center dark:border-border"><div className="flex items-center gap-2 text-[11px] text-slate-500"><ShieldAlert className="size-4 text-amber-600" />Exports are permission-gated, time-stamped, and audited.</div><button type="button" onClick={generate} disabled={pending} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-45 sm:ml-auto">{destination === "power_bi" ? <FileSpreadsheet className="size-4" /> : <Download className="size-4" />}{pending ? "Generating…" : destination === "power_bi" ? "Publish dataset" : "Generate export"}</button></div>
    {notice && <p role="status" className="mt-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900 dark:border-teal-900 dark:bg-teal-950 dark:text-teal-200">{notice}</p>}
  </section>;
}
