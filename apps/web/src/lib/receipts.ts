import { paymentReceiptSchema, type PaymentReceipt } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

/** The signed-in student's or landlord's payment receipts (0075); null when the API failed. */
export async function getMyReceipts(): Promise<PaymentReceipt[] | null> {
  const raw = await apiServer<unknown>("/reservations/receipts");
  const parsed = paymentReceiptSchema.array().safeParse(raw);
  return parsed.success ? parsed.data : null;
}
