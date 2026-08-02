'use client';

// Desktop nav (accent underline on the active route - the bug that started
// this redesign) plus a full-screen mobile overlay menu. One component so
// both share the same route list and active-state logic.
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { SignOutButton } from './SignOutButton';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/run', label: 'Run' },
  { href: '/tracking', label: 'Tracking' },
  { href: '/history', label: 'History' },
  { href: '/about', label: 'About' },
];

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav className="hidden items-center gap-6 text-[13px] text-ink-muted sm:flex">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`relative py-1 transition-colors hover:text-ink ${active ? 'text-ink' : ''}`}
            >
              {link.label}
              {active ? (
                <motion.span
                  layoutId="app-nav-active"
                  className="absolute -bottom-[1px] left-0 h-[1.5px] w-full bg-accent"
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
              ) : null}
            </Link>
          );
        })}
        <SignOutButton />
      </nav>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink sm:hidden"
      >
        <MenuIcon />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-canvas sm:hidden"
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="text-[15px] font-medium tracking-[0.24em] text-ink">A P E X</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center text-ink-muted hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex flex-col px-6 py-4">
              {LINKS.map((link, i) => {
                const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
                return (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[44px] items-center gap-3 py-3 text-[24px] text-ink-secondary"
                    >
                      {active ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" /> : <span className="w-1.5" />}
                      {link.label}
                    </Link>
                  </motion.div>
                );
              })}
              <div className="mt-6 min-h-[44px] py-3 text-[16px] text-ink-faint">
                <SignOutButton />
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
