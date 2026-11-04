import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function patchGoogle(source) {
  if ((source.match(/var defaultTimeout = 5e3;/g) ?? []).length !== 1) throw new Error('Unexpected Google connector version');
  if (!source.includes('var getUserInfoErrorHandler = (error) => {')) throw new Error('Missing Google error handler');
  return source.replace('var defaultTimeout = 5e3;', 'var defaultTimeout = 15e3;')
    .replace('var getUserInfoErrorHandler = (error) => {', `var getUserInfoErrorHandler = (error) => {
  if (error?.name === "TimeoutError" || error?.code === "ETIMEDOUT") {
    throw new ConnectorError(ConnectorErrorCodes.General, {
      errorDescription: "Google did not respond in time. Please start sign-in again, or use email to continue."
    });
  }`);
}
export function patchExperience(source, origin, consumerAppId) {
  const url = new URL(origin);
  if (url.protocol !== 'https:' || url.hostname !== 'staging.campushomes.co.ug' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Staging origin required');
  if (!consumerAppId || !/^[a-zA-Z0-9_-]{8,64}$/.test(consumerAppId)) throw new Error('Consumer application ID required');
  const before = '<TextLink replace to="/register" text="action.create_account" />';
  if (source.split(before).length !== 2) throw new Error('Unexpected hosted signup component');
  return source.replace(before, `{new URLSearchParams(window.location.search).get("app_id") === ${JSON.stringify(consumerAppId)} ? <TextLink href="${url.origin}/create-account" text="action.create_account" /> : <TextLink replace to="/register" text="action.create_account" />}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? '/etc/logto';
  const google = resolve(root, 'packages/connectors/connector-google/lib/index.js');
  const signIn = resolve(root, 'packages/experience/src/pages/SignIn/index.tsx');
  // Validate both first; never silently patch a different vendor release.
  const googleSource = patchGoogle(readFileSync(google, 'utf8'));
  const experienceSource = patchExperience(readFileSync(signIn, 'utf8'), 'https://staging.campushomes.co.ug', process.env.CONSUMER_APP_ID);
  writeFileSync(google, googleSource); writeFileSync(signIn, experienceSource);
}
