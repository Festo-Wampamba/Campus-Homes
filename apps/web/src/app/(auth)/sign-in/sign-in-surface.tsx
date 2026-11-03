import { LiveClock } from './live-clock';

export function SignInSurface({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#eef5f3] dark:bg-slate-950">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_12%_15%,rgba(252,177,119,0.32),transparent_32%),linear-gradient(135deg,#edf6f4_0%,#dcece8_52%,#c3ded9_100%)] dark:bg-[radial-gradient(circle_at_12%_15%,rgba(252,177,119,0.10),transparent_32%),linear-gradient(135deg,#112a2a_0%,#102826_52%,#0b1d1c_100%)]" />
      <div className="relative flex min-h-dvh w-full items-center justify-center overflow-y-auto p-4 py-8 sm:p-8">
        <div className="flex w-full max-w-md flex-col gap-4">
          <LiveClock />
          {children}
        </div>
      </div>
    </div>
  );
}
