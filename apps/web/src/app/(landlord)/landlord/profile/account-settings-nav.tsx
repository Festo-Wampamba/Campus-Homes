export const ACCOUNT_SECTIONS = [
  { id: "personal", label: "Personal details", description: "Your date of birth, gender, nationality, phone number and address." },
  { id: "identity", label: "Identity & verification", description: "The legal name we verified, and where your verification stands." },
  { id: "contact", label: "Contact & emergency", description: "Who we should call if we can't reach you." },
  { id: "security", label: "Sign-in & security", description: "The email you sign in with, and your password." },
] as const;

// Phones: a scrollable row of section chips at the top. Desktop: a sticky
// side menu beside the cards.
export function AccountSettingsNav() {
  return (
    <>
      <nav aria-label="Account settings sections" className="-mx-1 overflow-x-auto pb-1 lg:hidden">
        <ul className="flex gap-2 px-1 text-sm">
          {ACCOUNT_SECTIONS.map((s) => (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >{s.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <AccountSettingsSideNav />
    </>
  );
}

function AccountSettingsSideNav() {
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
