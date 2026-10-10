"use client";

import { useEffect, useState } from "react";

import { Dialog, DialogBody, DialogHeader } from "@/components/ui/dialog";
import { ViewDocumentButton } from "@/components/view-document-button";
import { api, apiErrorMessage } from "@/lib/api";
import { humanizeKey, LANDLORD_BUSINESS_TYPE_LABELS } from "@/lib/format";

type LandlordDetail = {
  user: {
    name: string | null;
    email: string | null;
    phone: string | null;
    status: string;
    createdAt: string;
    address: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    legalName?: string | null;
    kycStatus?: string | null;
    whatsappNumber?: string | null;
    businessType?: string | null;
    businessTypeOther?: string | null;
    idDocStorageKey?: string | null;
    properties?: { id: string; name: string; streetAddress: string; status: string; hasLiveListing: boolean }[];
  };
};

/** Read-only profile of one landlord, opened from the approved list. Reuses
 * GET /admin/users/:id, so landlords.read decides what's visible. */
export function LandlordDetailDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<LandlordDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    api<LandlordDetail>(`/admin/users/${userId}`)
      .then((data) => !cancelled && setDetail(data))
      .catch((err) => !cancelled && setError(apiErrorMessage(err, "Couldn't load this landlord's details.")));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const user = detail?.user;
  const businessType = user?.businessType === "other"
    ? user.businessTypeOther
    : user?.businessType && (LANDLORD_BUSINESS_TYPE_LABELS[user.businessType] ?? humanizeKey(user.businessType));

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && onClose()} size="lg">
      <DialogHeader title={user?.name || "Landlord details"} description="Approved landlord account" onClose={onClose} />
      <DialogBody className="space-y-6">
        {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
        {!user && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
        {user && (
          <>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <Field label="Legal name" value={user.legalName} />
              <Field label="Email" value={user.email} />
              <Field label="Phone" value={user.phone} />
              <Field label="WhatsApp" value={user.whatsappNumber} />
              <Field label="Business type" value={businessType} />
              <Field label="KYC status" value={user.kycStatus && humanizeKey(user.kycStatus)} />
              <Field label="Account status" value={humanizeKey(user.status)} />
              <Field label="Registered" value={new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} />
              <Field label="Address" value={user.address} />
              <Field
                label="Emergency contact"
                value={[user.emergencyContactName, user.emergencyContactPhone].filter(Boolean).join(" · ")}
              />
            </dl>
            {user.idDocStorageKey && <ViewDocumentButton storageKey={user.idDocStorageKey} label="View ID document" />}
            {user.properties && (
              <section className="space-y-2">
                <h3 className="text-sm font-bold">Properties ({user.properties.length})</h3>
                {user.properties.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No properties submitted yet.</p>
                ) : (
                  <ul className="divide-y divide-border rounded-lg border border-border">
                    {user.properties.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <span>
                          <span className="font-semibold">{p.name}</span>
                          <span className="block text-muted-foreground">{p.streetAddress}</span>
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {p.hasLiveListing ? "Live" : humanizeKey(p.status)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </DialogBody>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{value || "Not provided"}</dd>
    </div>
  );
}
