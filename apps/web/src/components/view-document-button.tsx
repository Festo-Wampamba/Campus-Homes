"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { apiErrorMessage } from "@/lib/api";
import { openDocument } from "@/lib/documents";

export function ViewDocumentButton({ storageKey, label }: { storageKey: string; label: string }) {
  const [error, setError] = useState<string | null>(null);
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);

  async function view() {
    setError(null);
    setBlockedUrl(null);
    try {
      setBlockedUrl(await openDocument(storageKey));
    } catch (err) {
      setError(apiErrorMessage(err, "Couldn't open the document."));
    }
  }

  return (
    <span className="mt-2 inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={view}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
      >
        <FileText aria-hidden className="size-4" />
        {label}
      </button>
      {blockedUrl && (
        <a href={blockedUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-primary hover:underline">
          Pop-up blocked. Open the document here
        </a>
      )}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
