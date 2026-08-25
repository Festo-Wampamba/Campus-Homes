import type { Env } from '../../config/env';

// Structural subset of the inquiry row (drizzle returns category/status as
// plain strings and timestamps as Dates — don't over-narrow here).
export type InquiryEmailPayload = {
  id: string;
  category: string;
  subject: string;
  message: string;
  studentName: string | null;
  studentEmail: string | null;
  studentPhone: string | null;
  createdAt: Date | string;
};

// Same posture as auth.email.ts: plain fetch to Resend, dev fallback logs
// instead of sending. Recipients come from SUPPORT_NOTIFY_EMAILS (comma-
// separated); nothing is configured = stored-only, no email leg.
export async function sendInquiryEmail(env: Env, inquiry: InquiryEmailPayload): Promise<void> {
  const recipients = (env.SUPPORT_NOTIFY_EMAILS ?? '')
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);

  if (recipients.length === 0) {
    console.log(`[inquiries] SUPPORT_NOTIFY_EMAILS unset — stored only (${inquiry.id})`);
    return;
  }

  const subject = `[CampusHomes Inquiry] ${inquiry.category}: ${inquiry.subject}`;
  const html = `
    <p><strong>${escapeHtml(inquiry.subject)}</strong> <em>(${inquiry.category})</em></p>
    <p>${escapeHtml(inquiry.message).replace(/\n/g, '<br/>')}</p>
    <hr/>
    <p>
      From: ${escapeHtml(inquiry.studentName ?? 'Unknown student')}<br/>
      Email: ${inquiry.studentEmail ?? '—'}<br/>
      Phone: ${inquiry.studentPhone ?? '—'}<br/>
      Submitted: ${inquiry.createdAt}
    </p>
    <p><a href="${env.AUTH_APP_URL}/admin/inquiries">Open the inquiries desk</a></p>
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] ${subject} → ${recipients.join(', ')}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: recipients,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    // Never echo the body — it may contain provider error details we don't
    // want in logs. Status is enough to diagnose a misconfigured key.
    throw new Error(`Resend rejected inquiry email with status ${res.status}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
