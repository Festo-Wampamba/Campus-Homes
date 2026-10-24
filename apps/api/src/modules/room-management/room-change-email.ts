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

  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] ${email.subject} → ${to.join(', ')}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to, subject: email.subject, html }),
  });
  if (!res.ok) {
    // Status only; the body may contain provider details we don't log.
    throw new Error(`Resend rejected room-change email with status ${res.status}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
