/** Identity is singular; workspaces are independently granted capabilities. */
export const WORKSPACES = ['student', 'landlord', 'ops', 'admin'] as const;
export type Workspace = (typeof WORKSPACES)[number];

export interface AuthenticationAssurance {
  /** Provider-verified authentication time, never application session creation. */
  authenticatedAt: string | null;
  mfaVerified: boolean;
}

export interface AccountAccess {
  workspaces: Workspace[];
  roles: string[];
  onboarding: { student: boolean; landlord: boolean };
  assurance: AuthenticationAssurance;
}

/** Normalize before checking origin; reject ambiguous browser URL syntax. */
export function safeAuthDestination(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u0020\u007f]/.test(decoded) || decoded.startsWith('//')) return null;
    const url = new URL(value, 'https://campushomes.invalid');
    if (url.origin !== 'https://campushomes.invalid') return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
