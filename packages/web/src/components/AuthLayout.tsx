import type { ReactNode } from "react";

const DOTS = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  top: `${Math.floor((i * 37 + 11) % 95)}%`,
  left: `${Math.floor((i * 53 + 7) % 95)}%`,
  delay: `${((i * 0.47) % 4).toFixed(2)}s`,
  duration: `${(3 + (i * 0.31) % 4).toFixed(2)}s`,
  size: i % 3 === 0 ? 3 : 2,
}));

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark relative flex min-h-svh flex-col overflow-hidden bg-background">
      {/* Starfield particles */}
      <div className="pointer-events-none fixed inset-0" aria-hidden="true">
        {DOTS.map((dot) => (
          <span
            key={dot.id}
            className="absolute rounded-full bg-muted-foreground/30"
            style={{
              top: dot.top,
              left: dot.left,
              width: dot.size,
              height: dot.size,
              animation: `float-dot ${dot.duration} ${dot.delay} ease-in-out infinite`,
              opacity: 0,
            }}
          />
        ))}
      </div>

      {/* Top nav — "Aixle Insights" wordmark centered */}
      <header className="relative z-10 flex h-20 shrink-0 items-center justify-center px-10">
        <p className="type-h2 font-medium text-foreground tracking-tight">Aixle Insights</p>
      </header>

      {/* Main content */}
      <main className="relative z-10 flex flex-1 items-center justify-center pb-32">
        {children}
      </main>

      {/* Footer */}
      <footer className="relative z-10 flex h-16 shrink-0 items-center justify-center px-8">
        <p className="type-caption text-center whitespace-nowrap text-muted-foreground/50">
          Aixle Insights © 2026
        </p>
      </footer>
    </div>
  );
}
