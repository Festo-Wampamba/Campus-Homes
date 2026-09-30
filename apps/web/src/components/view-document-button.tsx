"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { apiErrorMessage } from "@/lib/api";
import { openDocument } from "@/lib/documents";

export function ViewDocumentButton({ storageKey, label }: { storageKey: string; label: string }) {
  const [error, setError] = useState<string | null>(null);

  async function view() {
    setError(null);
    try {
      await openDocument(storageKey);
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
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
