// The shared page frame for every authenticated screen: a plain header with the
// wordmark and the app's destinations, active-route underlined in accent. No
// sidebar, no decoration - this is a tool, not a marketing site (that's the
// homepage's job).
import Link from 'next/link';
import { AppNav } from './AppNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <Link href="/run" className="text-[14px] font-medium tracking-[0.24em] text-ink">
            A P E X
          </Link>
          <AppNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8 sm:px-8">{children}</main>
    </div>
  );
}
