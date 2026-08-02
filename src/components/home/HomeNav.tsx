'use client';

// The public homepage nav: transparent over the hero, then a floating glass
// pill once you scroll past it. Mirrors the login header's transparent-to-
// glass pattern but stays a normal (non-blurred-until-scrolled) bar rather
// than the login screen's always-dark treatment - this page is meant to be
// read, not just arrived at.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#track-record', label: 'Track record' },
  { href: '#build', label: 'The build' },
  { href: '/about', label: 'About' },
];

export function HomeNav({ signedIn }: { signedIn: boolean }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 80);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-4">
      <motion.div
        animate={{
          maxWidth: scrolled ? 720 : 1152,
          borderRadius: scrolled ? 999 : 0,
        }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full border"
        style={{
          borderColor: scrolled ? 'var(--border-hair)' : 'transparent',
          background: scrolled ? 'rgba(17, 17, 18, 0.72)' : 'transparent',
          backdropFilter: scrolled ? 'blur(20px)' : 'none',
        }}
      >
        <div className="flex items-center justify-between px-5 py-3">
          <Link href="/" className="text-[13px] font-medium tracking-[0.24em] text-ink">
            A P E X
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] text-ink-secondary md:flex">
            {LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href={signedIn ? '/run' : '/login'}
              className="hidden rounded-md border border-hair px-4 py-2 text-[12px] font-medium text-ink transition-colors hover:border-strong md:block"
            >
              {signedIn ? 'Dashboard' : 'Sign in'}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              className="flex h-11 w-11 items-center justify-center text-ink-secondary md:hidden"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-canvas md:hidden"
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="text-[13px] font-medium tracking-[0.24em] text-ink">A P E X</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center text-ink-secondary"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="flex flex-col px-6 py-4">
              {[...LINKS, signedIn ? { href: '/run', label: 'Dashboard' } : { href: '/login', label: 'Sign in' }].map((link, i) => (
                <motion.div
                  key={link.href}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                >
                  <a
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-[44px] items-center py-3 text-[24px] text-ink-secondary"
                  >
                    {link.label}
                  </a>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
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
