import type { Env } from '../../config/env';

export type AuthEmailKind = 'verify-email' | 'reset-password' | 'set-password';
export type VerificationEmailKind = 'sign-in' | 'register' | 'forgot-password' | 'generic';

type AuthEmailInput = {
  to: string;
  url: string;
  name: string;
  kind: AuthEmailKind;
};

// A brand-new user (admin-invited staff, or a phone/Google user who never
// set a password) has no credential account yet — Better Auth's reset flow
// creates one on submit. Copy the email accordingly: "set" for the first
// time, "reset" for a genuine change.
export function pickPasswordEmailKind(hasCredentialAccount: boolean): AuthEmailKind {
  return hasCredentialAccount ? 'reset-password' : 'set-password';
}

const COPY: Record<AuthEmailKind, { title: string; action: string; intro: string }> = {
  'verify-email': {
    title: 'Verify your CampusHomes email',
    action: 'Verify email address',
    intro: 'Confirm your email address to finish setting up your CampusHomes account.',
  },
  'reset-password': {
    title: 'Reset your CampusHomes password',
    action: 'Reset password',
    intro: 'Use the secure link below to choose a new CampusHomes password.',
  },
  'set-password': {
    title: 'Set up your CampusHomes password',
    action: 'Set password',
    intro:
      'A CampusHomes administrator created your staff account. Set a password with the secure link below to sign in.',
  },
};

function content(input: AuthEmailInput) {
  const { title, action, intro } = COPY[input.kind];
  return {
    subject: title,
    html: `<!doctype html><html><body style="margin:0;background:#f4f8f7;color:#173b3b;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:36px 32px;background:#fff;border:1px solid #dce9e7;border-radius:18px"><div style="font-size:24px;font-weight:700;color:#087f80">CampusHomes</div><p style="color:#e47e7e;font-size:16px;font-style:italic;margin-top:4px">Live, Learn, Succeed.</p><p style="font-size:16px;line-height:1.6">Hi ${escapeHtml(input.name || 'there')},</p><p style="font-size:16px;line-height:1.6">${intro}</p><p style="margin:28px 0"><a href="${escapeHtml(input.url)}" style="display:inline-block;padding:13px 20px;border-radius:9px;background:#087f80;color:#fff;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:13px;line-height:1.6;color:#627979">This link expires automatically. If you did not request this, you can safely ignore this email.</p><p style="font-size:12px;color:#91a3a3">CampusHomes Uganda · Live, Learn, Succeed.</p></main></body></html>`,
    text: `${title}\n\nHi ${input.name || 'there'},\n\n${intro}\n\n${input.url}\n\nThis link expires automatically.`,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

const VERIFICATION_TITLE: Record<VerificationEmailKind, string> = {
  'sign-in': 'Your CampusHomes sign-in code',
  register: 'Your CampusHomes verification code',
  'forgot-password': 'Your CampusHomes password reset code',
  generic: 'Your CampusHomes verification code',
};

function verificationContent(kind: VerificationEmailKind, code: string) {
  const title = VERIFICATION_TITLE[kind];
  const html = `<!doctype html><html><body style="margin:0;background:#f4f8f7;color:#173b3b;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:36px 32px;background:#fff;border:1px solid #dce9e7;border-radius:18px"><div style="font-size:24px;font-weight:700;color:#087f80">CampusHomes</div><p style="color:#e47e7e;font-size:16px;font-style:italic;margin-top:4px">Live, Learn, Succeed.</p><p style="font-size:16px;line-height:1.6">${title}:</p><p style="margin:28px 0;font-size:32px;font-weight:700;letter-spacing:6px;color:#087f80">${escapeHtml(code)}</p><p style="font-size:13px;line-height:1.6;color:#627979">This code expires shortly. If you did not request it, you can safely ignore this email.</p><p style="font-size:12px;color:#91a3a3">CampusHomes Uganda · Live, Learn, Succeed.</p></main></body></html>`;
  const text = `${title}: ${code}\n\nThis code expires shortly.`;
  return { subject: title, html, text };
}

type EmailMessage = { subject: string; html: string; text: string };

async function deliver(env: Env, to: string, message: EmailMessage, devLogValue: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.info(`[email:dev] ${message.subject} for ${to}: ${devLogValue}`);
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.AUTH_EMAIL_FROM, to: [to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!response.ok) {
    throw new Error(`Resend email delivery failed: HTTP ${response.status}`);
  }
}

/** For Logto's HTTP Email connector — a plain verification code, not a
 * clickable link (see logto-email-webhook.controller.ts). Kept separate
 * from sendAuthEmail's link-shaped templates rather than overloading them. */
export async function sendVerificationCodeEmail(
  env: Env,
  input: { to: string; code: string; kind: VerificationEmailKind },
): Promise<void> {
  await deliver(env, input.to, verificationContent(input.kind, input.code), input.code);
}

export async function sendAuthEmail(env: Env, input: AuthEmailInput): Promise<void> {
  await deliver(env, input.to, content(input), input.url);
}
