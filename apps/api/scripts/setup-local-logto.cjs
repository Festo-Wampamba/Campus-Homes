/**
 * One-command local auth setup: provisions the local Logto (docker-compose.local.yml)
 * the same way staging/production are configured, then writes the generated
 * values into apps/api/.env.
 *
 *   - Consumer + Staff "Traditional web" apps with the web-origin callback
 *     and the exact post-logout URIs the API uses.
 *   - HTTP Email connector -> API /api/auth/logto/email-webhook (bearer secret).
 *     In development the API prints the code to its console (auth.email.ts).
 *   - Sign-in experience: email + verification code / password, TOTP MFA
 *     prompted at sign-in and sign-up (staff sign-in requires it).
 *   - A non-superuser `campushomes_app` login role in `app_user`, so local RLS
 *     is enforced exactly as in production (superusers bypass RLS).
 *
 * Idempotent. Refuses to run against anything but localhost.
 * Prerequisite: LOGTO_M2M_APP_ID / LOGTO_M2M_APP_SECRET in apps/api/.env for a
 * machine-to-machine app holding the "Logto Management API access" role.
 */
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const ENV_PATH = path.join(__dirname, '..', '.env');
const LOGTO = 'http://localhost:3001';
const WEB = 'http://localhost:3000';
const MANAGEMENT_RESOURCE = 'https://default.logto.app/api';
const WEBHOOK = 'http://host.docker.internal:4000/api/auth/logto/email-webhook';
const APPS = {
  consumer: 'CampusHomes Local Consumer',
  staff: 'CampusHomes Local Staff',
};

function fail(message) {
  console.error(`\nsetup-local-logto: ${message}\n`);
  process.exit(1);
}

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) fail('apps/api/.env not found. Copy apps/api/.env.example to apps/api/.env first.');
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  const values = {};
  for (const line of lines) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { lines, values };
}

function writeEnv(lines, updates) {
  const backup = `${ENV_PATH}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  fs.copyFileSync(ENV_PATH, backup);
  fs.chmodSync(backup, 0o600);
  const pending = new Map(Object.entries(updates));
  const out = lines.map((line) => {
    const key = /^\s*([A-Z0-9_]+)\s*=/.exec(line)?.[1];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  if (pending.size) {
    if (out.at(-1) !== '') out.push('');
    out.push('# Written by pnpm local:logto');
    for (const [key, value] of pending) out.push(`${key}=${value}`);
    out.push('');
  }
  fs.writeFileSync(ENV_PATH, out.join('\n'), { mode: 0o600 });
  fs.chmodSync(ENV_PATH, 0o600);
  return backup;
}

function assertLocal(url, label) {
  const host = new URL(url).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) fail(`${label} must point at localhost (got ${host}). This script never touches a deployed environment.`);
}

const secret = (bytes = 32) => randomBytes(bytes).toString('base64url');

async function managementToken(appId, appSecret) {
  const res = await fetch(`${LOGTO}/oidc/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials', resource: MANAGEMENT_RESOURCE, scope: 'all' }),
  });
  if (!res.ok) fail(`Could not get a Management API token (HTTP ${res.status}). Check the M2M app ID/secret and that it has the "Logto Management API access" role.`);
  return (await res.json()).access_token;
}

function managementApi(token) {
  return async (method, route, body) => {
    const res = await fetch(`${LOGTO}/api${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) fail(`${method} /api${route} failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? null : res.json();
  };
}

async function ensureApp(api, name, envSecret) {
  const oidcClientMetadata = {
    redirectUris: [`${WEB}/api/auth/logto/callback`],
    postLogoutRedirectUris: [`${WEB}/sign-in`, WEB],
  };
  const existing = (await api('GET', '/applications?page_size=100')).find((app) => app.name === name);
  const app = existing
    ? await api('PATCH', `/applications/${existing.id}`, { oidcClientMetadata })
    : await api('POST', '/applications', { name, type: 'Traditional', oidcClientMetadata });
  if (envSecret?.id === app.id && envSecret.value) return { id: app.id, secret: envSecret.value, created: !existing };
  const issued = await api('POST', `/applications/${app.id}/secrets`, { name: `local-setup-${Date.now()}` });
  return { id: app.id, secret: issued.value, created: !existing };
}

async function ensureEmailConnector(api, webhookSecret) {
  const config = { endpoint: WEBHOOK, authorization: `Bearer ${webhookSecret}` };
  const existing = (await api('GET', '/connectors')).find((c) => c.connectorId === 'http-email');
  if (existing) await api('PATCH', `/connectors/${existing.id}`, { config });
  else await api('POST', '/connectors', { connectorId: 'http-email', config });
}

async function configureSignIn(api) {
  await api('PATCH', '/sign-in-exp', {
    signUp: { identifiers: ['email'], password: false, verify: true },
    signIn: { methods: [{ identifier: 'email', password: true, verificationCode: true, isPasswordPrimary: false }] },
    mfa: { factors: ['Totp', 'BackupCode'], policy: 'PromptAtSignInAndSignUp' },
  });
}

async function ensureAppRole(ownerUrl, currentRuntimeUrl) {
  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const { rows } = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'app_user'`);
    if (!rows.length) fail('Role app_user is missing. Run `pnpm --filter @campushomes/api db:migrate` first.');
    const current = (() => {
      try { return new URL(currentRuntimeUrl); } catch { return null; }
    })();
    const reuse = current?.username === 'campushomes_app' && current.password;
    const password = reuse ? decodeURIComponent(current.password) : secret(24);
    const exists = (await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'campushomes_app'`)).rowCount > 0;
    // Identifier and password are not user input; format() keeps quoting correct.
    await pool.query(
      `SELECT format('${exists ? 'ALTER' : 'CREATE'} ROLE campushomes_app LOGIN INHERIT NOSUPERUSER NOBYPASSRLS PASSWORD %L', $1::text) AS sql`,
      [password],
    ).then(({ rows: [{ sql }] }) => pool.query(sql));
    await pool.query('GRANT app_user TO campushomes_app');
    const runtime = new URL(ownerUrl);
    runtime.username = 'campushomes_app';
    runtime.password = encodeURIComponent(password);
    return runtime.toString();
  } finally {
    await pool.end();
  }
}

async function main() {
  const { lines, values } = readEnv();
  if (values.NODE_ENV === 'production') fail('Refusing to run with NODE_ENV=production.');

  const ownerUrl = values.DATABASE_MIGRATIONS_URL || values.DATABASE_URL;
  if (!ownerUrl) fail('DATABASE_URL is missing from apps/api/.env.');
  assertLocal(ownerUrl, 'The database URL');
  if (new URL(ownerUrl).username === 'campushomes_app') fail('Set DATABASE_MIGRATIONS_URL to the owner (campushomes) connection first.');

  if (!values.LOGTO_M2M_APP_ID || !values.LOGTO_M2M_APP_SECRET) {
    fail('LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET are missing from apps/api/.env. Create the M2M app in the local Logto console (http://localhost:3002) first; see README "Local sign-in (Logto)".');
  }

  const token = await managementToken(values.LOGTO_M2M_APP_ID, values.LOGTO_M2M_APP_SECRET);
  const api = managementApi(token);

  const consumer = await ensureApp(api, APPS.consumer, { id: values.LOGTO_CONSUMER_APP_ID, value: values.LOGTO_CONSUMER_APP_SECRET });
  const staff = await ensureApp(api, APPS.staff, { id: values.LOGTO_STAFF_APP_ID, value: values.LOGTO_STAFF_APP_SECRET });
  const webhookSecret = values.LOGTO_EMAIL_WEBHOOK_SECRET || secret();
  await ensureEmailConnector(api, webhookSecret);
  await configureSignIn(api);
  const runtimeUrl = await ensureAppRole(ownerUrl, values.DATABASE_URL);

  const backup = writeEnv(lines, {
    DATABASE_URL: runtimeUrl,
    DATABASE_MIGRATIONS_URL: ownerUrl,
    AUTH_APP_URL: WEB,
    WEB_ORIGIN: WEB,
    LOGTO_ENDPOINT: LOGTO,
    LOGTO_CONSUMER_APP_ID: consumer.id,
    LOGTO_CONSUMER_APP_SECRET: consumer.secret,
    LOGTO_STAFF_APP_ID: staff.id,
    LOGTO_STAFF_APP_SECRET: staff.secret,
    LOGTO_COOKIE_SECRET: values.LOGTO_COOKIE_SECRET?.length >= 32 ? values.LOGTO_COOKIE_SECRET : secret(48),
    LOGTO_EMAIL_WEBHOOK_SECRET: webhookSecret,
    LOGTO_MFA_POLICY_VERIFIED: 'true',
  });

  console.log(`
Local Logto is configured.
  Consumer app : ${consumer.created ? 'created' : 'updated'} (${consumer.id})
  Staff app    : ${staff.created ? 'created' : 'updated'} (${staff.id})
  Email        : HTTP connector -> API webhook (codes print in the API console)
  Sign-in      : email code or password, TOTP MFA
  Database     : API now connects as campushomes_app (RLS enforced)
apps/api/.env updated (secrets not printed). Previous file: ${path.basename(backup)}
Next: pnpm dev, then sign in at ${WEB}/sign-in
`);
}

main().catch((err) => {
  const refused = err.cause?.code === 'ECONNREFUSED' ? err.cause : null;
  fail(refused
    ? `Nothing is answering on ${refused.address}:${refused.port}. Start the local services with \`pnpm local:up\` and run this again.`
    : err.message);
});
