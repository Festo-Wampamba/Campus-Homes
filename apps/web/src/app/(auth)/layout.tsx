// Deliberately no SiteHeader/SiteFooter here — auth pages are a full-viewport
// experience (background + centered card), not a scrollable marketing page.
export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
