// Safely brands Logto's tenant-wide hosted sign-in experience. The command is
// dry-run by default; pass --apply and an explicit BRANDING_TARGET. Production
// additionally requires ALLOW_PRODUCTION_SIGNIN_BRANDING=true.

const CUSTOM_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

#app,
#app button,
#app input {
  font-family: 'Poppins', system-ui, sans-serif;
}

#app button:focus-visible,
#app input:focus-visible {
  outline: 3px solid rgba(240, 128, 128, 0.45);
  outline-offset: 2px;
}
`.trim();

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readOptions(env, argv) {
  const endpoint = required(env, 'LOGTO_ENDPOINT').replace(/\/$/, '');
  const webOrigin = required(env, 'WEB_ORIGIN').replace(/\/$/, '');
  const target = required(env, 'BRANDING_TARGET');
  if (!['staging', 'production'].includes(target)) {
    throw new Error('BRANDING_TARGET must be staging or production');
  }
  const endpointHost = new URL(endpoint).hostname;
  const webHost = new URL(webOrigin).hostname;
  const looksStaging = endpointHost.includes('staging') && webHost.includes('staging');
  if ((target === 'staging') !== looksStaging) {
    throw new Error(`BRANDING_TARGET=${target} does not match LOGTO_ENDPOINT and WEB_ORIGIN`);
  }
  const apply = argv.includes('--apply');
  if (target === 'production' && apply && env.ALLOW_PRODUCTION_SIGNIN_BRANDING !== 'true') {
    throw new Error('Refusing production apply without ALLOW_PRODUCTION_SIGNIN_BRANDING=true');
  }
  return {
    endpoint,
    webOrigin,
    target,
    apply,
    appId: required(env, 'LOGTO_M2M_APP_ID'),
    appSecret: required(env, 'LOGTO_M2M_APP_SECRET'),
    resource: env.LOGTO_MANAGEMENT_API_RESOURCE?.trim() || 'https://default.logto.app/api',
  };
}

function buildBrandingPatch(webOrigin) {
  const logoUrl = `${webOrigin}/images/branding/campushomes-mark.png`;
  return {
    color: {
      primaryColor: '#008080',
      isDarkModeEnabled: true,
      darkPrimaryColor: '#2dd4bf',
    },
    branding: { logoUrl, darkLogoUrl: logoUrl },
    customCss: CUSTOM_CSS,
  };
}

async function requestToken(options, fetcher) {
  const response = await fetcher(`${options.endpoint}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: options.appId,
      client_secret: options.appSecret,
      resource: options.resource,
      scope: 'all',
    }),
  });
  if (!response.ok) throw new Error(`Logto token request failed: HTTP ${response.status}`);
  const body = await response.json();
  if (typeof body.access_token !== 'string' || !body.access_token) {
    throw new Error('Logto token response did not contain an access token');
  }
  return body.access_token;
}

async function applySignInBranding(options, fetcher = fetch) {
  const token = await requestToken(options, fetcher);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const before = await fetcher(`${options.endpoint}/api/sign-in-exp`, { headers });
  if (!before.ok) throw new Error(`GET sign-in-exp failed: HTTP ${before.status}`);
  const previous = await before.json();
  const patch = buildBrandingPatch(options.webOrigin);

  if (!options.apply) {
    return {
      ok: true,
      dryRun: true,
      target: options.target,
      endpoint: options.endpoint,
      previousPrimaryColor: previous?.color?.primaryColor ?? null,
      proposed: patch,
    };
  }

  const response = await fetcher(`${options.endpoint}/api/sign-in-exp`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(`PATCH sign-in-exp failed: HTTP ${response.status}`);
  return {
    ok: true,
    dryRun: false,
    target: options.target,
    endpoint: options.endpoint,
    previousPrimaryColor: previous?.color?.primaryColor ?? null,
    applied: patch,
  };
}

async function run() {
  const options = readOptions(process.env, process.argv.slice(2));
  console.log(JSON.stringify(await applySignInBranding(options)));
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { CUSTOM_CSS, applySignInBranding, buildBrandingPatch, readOptions };
