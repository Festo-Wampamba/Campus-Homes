import { paymentReceiptSchema, type PaymentReceipt } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

/** The signed-in user's payment receipts as a student or as a landlord (0075); null when the API failed. */
export async function getMyReceipts(side: "student" | "landlord"): Promise<PaymentReceipt[] | null> {
  const raw = await apiServer<unknown>(side === "student" ? "/reservations/receipts" : "/reservations/landlord-receipts");
  const parsed = paymentReceiptSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : null;
}
