/** Inline styles are needed by map markers and interactive UI; scripts require a nonce. */
export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data: blob:",
    "font-src 'self' data:",
    // Configured tiles, direct storage uploads and Soketi use external TLS origins.
    `connect-src 'self' https: wss:${development ? ' http://localhost:* ws://localhost:*' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ['upgrade-insecure-requests']),
  ].join('; ');
}
