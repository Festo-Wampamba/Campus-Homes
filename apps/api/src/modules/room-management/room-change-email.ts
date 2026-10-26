import { escapeHtml, sendNotificationEmail } from '../../adapters/notification-email';
import type { Env } from '../../config/env';

export type RoomChangeEmail = {
  to: string[];
  subject: string;
  message: string;
  /** App path the button opens, e.g. /ops/room-changes. */
  path: string;
  action: string;
};

// Same posture as listing-published-email.ts: plain fetch to Resend, dev
// fallback logs instead of sending. Callers treat it as best-effort: the
// in-app notification is already stored.
export async function sendRoomChangeEmail(env: Env, email: RoomChangeEmail): Promise<void> {
  const to = email.to.filter(Boolean);
  if (to.length === 0) return;
  const html = `
    <p>${escapeHtml(email.message)}</p>
    <p><a href="${env.AUTH_APP_URL}${email.path}">${escapeHtml(email.action)}</a></p>
  `;

  await sendNotificationEmail(env, { to, subject: email.subject, html, kind: 'room-change' });
}
