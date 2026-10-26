import { escapeHtml, sendNotificationEmail } from '../../adapters/notification-email';
import type { Env } from '../../config/env';

export type PaymentReceiptEmail = {
  to: string;
  /** Who the copy is for: the wording and the link differ. */
  audience: 'student' | 'landlord';
  receiptNumber: string;
  studentName: string;
  propertyName: string;
  roomLabel: string;
  bookingFeeUgx: number;
  depositUgx: number;
  paymentMethod: string | null;
  recordedAt: Date;
};

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash',
  mtn_momo: 'MTN MoMo',
  airtel_money: 'Airtel Money',
  card: 'Card',
  bank_transfer: 'Bank transfer',
};

const ugx = (amount: number) => `UGX ${amount.toLocaleString('en-UG')}`;

// Same posture as listing-published-email.ts: plain fetch to Resend, dev
// fallback logs instead of sending. Best-effort: the receipt row is the record.
export async function sendPaymentReceiptEmail(env: Env, receipt: PaymentReceiptEmail): Promise<void> {
  const subject = `CampusHomes receipt ${receipt.receiptNumber}: ${ugx(receipt.bookingFeeUgx + receipt.depositUgx)}`;
  const intro = receipt.audience === 'student'
    ? `${escapeHtml(receipt.propertyName)} recorded this payment from you.`
    : `You recorded this payment from ${escapeHtml(receipt.studentName)}.`;
  const rows = [
    ['Receipt', receipt.receiptNumber],
    ['Student', receipt.studentName],
    ['Hostel', receipt.propertyName],
    ['Room', receipt.roomLabel],
    ['Booking fee', ugx(receipt.bookingFeeUgx)],
    ['Deposit', ugx(receipt.depositUgx)],
    ['Total received', ugx(receipt.bookingFeeUgx + receipt.depositUgx)],
    ['Paid with', receipt.paymentMethod ? (METHOD_LABEL[receipt.paymentMethod] ?? receipt.paymentMethod) : 'Not recorded'],
    ['Date', receipt.recordedAt.toLocaleString('en-UG', { timeZone: 'Africa/Kampala' })],
  ];
  const path = receipt.audience === 'student' ? '/reservations' : '/landlord/payments';
  const html = `
    <p>${intro}</p>
    <table cellpadding="6" style="border-collapse:collapse">
      ${rows.map(([label, value]) => `<tr><td><strong>${escapeHtml(label!)}</strong></td><td>${escapeHtml(value!)}</td></tr>`).join('')}
    </table>
    <p>Payment is between the student and the landlord; CampusHomes keeps this copy for both of you.</p>
    <p><a href="${env.AUTH_APP_URL}${path}">View it on CampusHomes</a></p>
  `;

  await sendNotificationEmail(env, { to: [receipt.to], subject, html, kind: 'payment receipt' });
}
