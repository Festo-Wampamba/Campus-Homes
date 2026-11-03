import { Card, CardContent } from '@/components/ui/card';

export function SignInCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="w-full max-w-md rounded-[1.5rem] border-white/70 bg-white/95 shadow-[0_24px_80px_-32px_rgba(23,63,67,0.45)] backdrop-blur [overflow-wrap:anywhere] [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:py-2 dark:border-border dark:bg-card/95">
      <CardContent className="p-6 sm:p-8">{children}</CardContent>
    </Card>
  );
}
