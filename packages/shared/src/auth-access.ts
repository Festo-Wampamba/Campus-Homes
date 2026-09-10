/** Identity is singular; workspaces are independently granted capabilities. */
export const WORKSPACES = ['student', 'landlord', 'ops', 'admin'] as const;
export type Workspace = (typeof WORKSPACES)[number];
export type AuthIntent = 'student' | 'landlord' | 'staff';

/** Public enrollment intent never grants staff access. */
export function authIntent(value: unknown, portal?: unknown, next?: unknown): AuthIntent {
  if (portal === 'staff') return 'staff';
  if (value === 'student' || value === 'landlord' || value === 'staff') return value;
  const destination = safeAuthDestination(next);
  return destination && new URL(destination, 'https://campushomes.invalid').pathname === '/landlords/enroll'
    ? 'landlord' : 'student';
}

export interface AuthenticationAssurance {
  /** Provider-verified authentication time, never application session creation. */
  authenticatedAt: string | null;
  mfaVerified: boolean;
}

export interface AccountAccess {
  /** Absent only on older API versions during rolling deployment. */
  permissions?: string[];
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
