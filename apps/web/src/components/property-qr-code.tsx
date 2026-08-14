"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode } from "lucide-react";

import { cn } from "@/lib/utils";

// One QR per property, printed and posted on-site: scanning it opens
// /agreement/:propertyId, which gates through sign-in/profile-completion
// before showing the tenant agreement form — see that route for the rest of
// the flow. Generated client-side (no backend endpoint needed): the target
// URL is just the property id, which is already public info via the listing
// detail page.
export function PropertyQrCode({
  propertyId,
  propertyName,
  className,
}: {
  propertyId: string;
  propertyName: string;
  className?: string;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const targetUrl = new URL(`/agreement/${propertyId}`, window.location.origin).toString();
    QRCode.toDataURL(targetUrl, { width: 240, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  return (
    <div className={cn("flex items-center gap-4 rounded-md border border-border p-4", className)}>
      <div className="flex size-24 shrink-0 items-center justify-center rounded-md bg-muted">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- generated data URL, not a storage URL
          <img src={dataUrl} alt={`QR code for ${propertyName}`} className="size-24" />
        ) : (
          <QrCode aria-hidden className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Tenant registration QR</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Print and post this at the property. Scanning it takes a student straight to the digital
          tenant agreement for {propertyName}.
        </p>
        {dataUrl && (
          <a
            href={dataUrl}
            download={`${propertyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
          >
            <Download aria-hidden className="size-3.5" />
            Download PNG
          </a>
        )}
      </div>
    </div>
  );
}
