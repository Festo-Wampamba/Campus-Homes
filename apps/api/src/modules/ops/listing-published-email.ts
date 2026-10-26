import { escapeHtml, sendNotificationEmail } from '../../adapters/notification-email';
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

  await sendNotificationEmail(env, { to: [email.to], subject, html, kind: 'listing-published' });
}
