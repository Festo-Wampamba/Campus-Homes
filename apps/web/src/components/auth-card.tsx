import { Wordmark } from "@/components/shell/wordmark";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-teal-900 p-4">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <Wordmark stacked />
        <h1 className="text-xl">{title}</h1>
        {children}
      </section>
    </main>
  );
}
