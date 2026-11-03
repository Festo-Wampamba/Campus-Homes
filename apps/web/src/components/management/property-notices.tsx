export interface PropertyNotice {
  id: string;
  title: string;
  body: string;
  propertyName: string;
}
export function PropertyNotices({ notes }: { notes: PropertyNotice[] }) {
  if (!notes?.length) return null;
  return (
    <section className="mt-8 min-w-0 rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">Property notices</h2>
      <div className="mt-4 divide-y divide-border">
        {notes.map((n) => (
          <article key={n.id} className="space-y-2 py-4">
            <h3 className="break-words font-semibold">{n.title}</h3>
            <p className="text-xs text-muted-foreground">{n.propertyName}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{n.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
