import type { ReactNode } from "react";

interface MainLayoutProps {
  header: ReactNode;
  main: ReactNode;
}

/** Two-column layout: header full width, main content 70/30 split. */
export function MainLayout({ header, main }: MainLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-primary)]">
      <header className="flex-shrink-0 border-b border-[var(--border-default)]">
        {header}
      </header>
      <main className="flex-1 flex min-h-0">
        {main}
      </main>
    </div>
  );
}
