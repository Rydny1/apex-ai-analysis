// The shared page frame for every authenticated screen: a plain header with the
// wordmark, the three destinations, and sign-out. No sidebar, no decoration -
// this is a tool, not a marketing site.
import Link from 'next/link';
import { SignOutButton } from './SignOutButton';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line" style={{ borderBottomWidth: '0.5px' }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-8 py-4">
          <Link href="/run" className="text-[15px] font-medium tracking-[0.08em] text-ink">
            APEX
          </Link>
          <nav className="flex items-center gap-6 text-[13px] text-ink-muted">
            <Link href="/run" className="hover:text-ink">
              Run
            </Link>
            <Link href="/tracking" className="hover:text-ink">
              Tracking
            </Link>
            <Link href="/history" className="hover:text-ink">
              History
            </Link>
            <Link href="/about" className="hover:text-ink">
              About
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
