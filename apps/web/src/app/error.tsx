"use client";

export default function ServiceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl">Service unavailable</h1>
        <p role="alert" className="text-sm text-muted-foreground">We couldn&apos;t load this page securely. Please try again in a moment.</p>
        <button onClick={reset} className="rounded-lg bg-coral-500 px-5 py-3 font-semibold text-teal-900">Try again</button>
      </div>
    </main>
  );
}
