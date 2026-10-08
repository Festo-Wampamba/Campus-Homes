"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";

import { cn } from "@/lib/utils";

const QR_SIZE = 480;
const PADDING = 32;

// The printed poster carries the link as text under the code, so a student
// whose phone can't read the QR can still type it in.
async function posterDataUrl(targetUrl: string): Promise<string> {
  const qr = document.createElement("canvas");
  await QRCode.toCanvas(qr, targetUrl, { width: QR_SIZE, margin: 1 });
  const width = QR_SIZE + PADDING * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = QR_SIZE + PADDING * 2 + 76;
  const ctx = canvas.getContext("2d");
  if (!ctx) return qr.toDataURL("image/png");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(qr, PADDING, PADDING);
  ctx.fillStyle = "#334155";
  ctx.textAlign = "center";
  ctx.font = "600 18px sans-serif";
  ctx.fillText("Can't scan? Open this link:", width / 2, QR_SIZE + PADDING + 34);
  const link = targetUrl.replace(/^https?:\/\//, "");
  let size = 18;
  do {
    ctx.font = `${size}px monospace`;
    size -= 1;
  } while (ctx.measureText(link).width > width - PADDING && size > 9);
  ctx.fillStyle = "#0f172a";
  ctx.fillText(link, width / 2, QR_SIZE + PADDING + 62);
  return canvas.toDataURL("image/png");
}

// One QR per property, printed and posted on-site: scanning it opens
// /agreement/:propertyId, which gates through sign-in/profile-completion
// before showing the tenant agreement form; see that route for the rest of
// the flow. Generated client-side (no backend endpoint needed): the target
// URL is just the property id, which is already public via the listing page.
export function PropertyQrCode({
  propertyId,
  propertyName,
  className,
}: {
  propertyId: string;
  propertyName: string;
  className?: string;
}) {
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(`/agreement/${propertyId}`, window.location.origin).toString();
    Promise.all([QRCode.toDataURL(url, { width: 240, margin: 1 }), posterDataUrl(url)])
      .then(([qr, poster]) => {
        if (cancelled) return;
        setTargetUrl(url);
        setDataUrl(qr);
        setPosterUrl(poster);
      })
      .catch(() => {
        if (!cancelled) setTargetUrl(url);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  async function copyLink() {
    if (!targetUrl) return;
    try {
      await navigator.clipboard.writeText(targetUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the link is
      // still visible and selectable right beside the button.
    }
  }

  return (
    <div className={cn("flex flex-col gap-4 rounded-md border border-border p-4 sm:flex-row sm:items-center", className)}>
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
          tenant agreement for {propertyName}. If a phone can&apos;t read the code, the student can
          open the link instead. It&apos;s printed under the code on the downloaded poster.
        </p>
        {targetUrl && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <code className="min-w-0 max-w-full truncate rounded-md bg-muted px-2 py-1 text-xs text-foreground select-all">
              {targetUrl}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {copied ? <Check aria-hidden className="size-3.5 text-success" /> : <Copy aria-hidden className="size-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
            <a
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <ExternalLink aria-hidden className="size-3.5" />
              Open
            </a>
          </div>
        )}
        {posterUrl && (
          <a
            href={posterUrl}
            download={`${propertyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-qr.png`}
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 underline-offset-4 hover:underline dark:text-teal-300"
          >
            <Download aria-hidden className="size-3.5" />
            Download poster (PNG)
          </a>
        )}
        <p aria-live="polite" className="sr-only">{copied ? "Link copied" : ""}</p>
      </div>
    </div>
  );
}
