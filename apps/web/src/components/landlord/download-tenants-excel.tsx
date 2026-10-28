import { FileSpreadsheet } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/** Downloads the tenant ledger (contacts, total, paid, balance) as an Excel
 * file, built by the API so it opens the same in Excel, LibreOffice, Numbers
 * and Google Sheets. */
export function DownloadTenantsExcel({ disabled = false }: { disabled?: boolean }) {
  if (disabled) return null;
  return (
    <a href="/api/v1/reservations/landlord-tenants/export" download className={buttonVariants({ variant: "secondary", size: "sm" })}>
      <FileSpreadsheet aria-hidden />
      Download Excel
    </a>
  );
}
