import type { Env } from '../config/env';

/**
 * Best-effort notification email through Resend's HTTP API. Without
 * RESEND_API_KEY it logs the subject instead of sending (local dev). Callers
 * decide whether a failure matters; the in-app record is the source of truth.
 * Sign-in codes and invitations go through auth.email.ts, which must fail
 * loudly in production instead.
 */
export async function sendNotificationEmail(
  env: Env,
  email: { to: string[]; subject: string; html: string; kind: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] ${email.subject} → ${email.to.join(', ')}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: email.to, subject: email.subject, html: email.html }),
  });
  if (!res.ok) {
    // Status only; the body may contain provider details we don't log.
    throw new Error(`Resend rejected ${email.kind} email with status ${res.status}`);
  }
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]!);
}
