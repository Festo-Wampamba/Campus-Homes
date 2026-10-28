"use client";

import { Download } from "lucide-react";
import type { LandlordTenant } from "@campushomes/shared";

import { Button } from "@/components/ui/button";
import { tenantsCsv } from "@/lib/tenant-ledger";

/** Saves the tenant table (contacts, total, paid, balance) as a CSV file. */
export function DownloadTenantsCsv({ tenants }: { tenants: LandlordTenant[] }) {
  function download() {
    // BOM so Excel opens the file as UTF-8 (names with accents stay readable).
    const blob = new Blob([`﻿${tenantsCsv(tenants)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campushomes-tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="secondary" size="sm" onClick={download} disabled={tenants.length === 0}>
      <Download aria-hidden />
      Download CSV
    </Button>
  );
}
