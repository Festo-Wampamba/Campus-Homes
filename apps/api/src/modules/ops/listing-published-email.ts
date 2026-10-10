import type { Env } from '../../config/env';

export type ListingPublishedEmail = {
  to: string;
  landlordName: string | null;
  propertyName: string;
};

// Same posture as inquiry-email.ts: plain fetch to Resend, dev fallback logs
// instead of sending. Callers treat it as best-effort.
export async function sendListingPublishedEmail(env: Env, email: ListingPublishedEmail): Promise<void> {
  const subject = `${email.propertyName} is now live on CampusHomes`;
  const greeting = email.landlordName ? `Hello ${escapeHtml(email.landlordName)},` : 'Hello,';
  const html = `
    <p>${greeting}</p>
    <p>Good news: <strong>${escapeHtml(email.propertyName)}</strong> has been verified and published by our team.
    Students can now find it and reserve rooms.</p>
    <p>Thank you for listing with CampusHomes.</p>
    <p><a href="${env.AUTH_APP_URL}/landlord/properties">View your properties</a></p>
  `;

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] ${subject} → ${email.to}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [email.to], subject, html }),
  });
  if (!res.ok) {
    // Status only; the body may contain provider details we don't log.
    throw new Error(`Resend rejected listing-published email with status ${res.status}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
