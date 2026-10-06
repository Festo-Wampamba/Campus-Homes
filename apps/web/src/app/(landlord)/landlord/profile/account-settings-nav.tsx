export const ACCOUNT_SECTIONS = [
  { id: "personal", label: "Personal details" },
  { id: "identity", label: "Identity & verification" },
  { id: "contact", label: "Contact & emergency" },
  { id: "security", label: "Sign-in & security" },
] as const;

// In-page jump links; hidden below lg, where the sections simply stack.
export function AccountSettingsNav() {
  return (
    <nav aria-label="Account settings sections" className="hidden lg:block">
      <ul className="sticky top-6 space-y-1 text-sm">
        {ACCOUNT_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block rounded-md px-3 py-2 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >{s.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
