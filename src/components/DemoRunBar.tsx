'use client';

// The guest-mode equivalent of RunBar. Every real Anthropic run costs real
// money (~$0.25) - if this app gets shared and a few hundred people click
// "Run analysis," that's real spend for zero benefit, since a portfolio
// reviewer only needs to see what the system produces, not personally pay
// for it. So non-admin accounts never hit /api/run at all: the button opens
// a modal explaining the gate and points at the real, shared track record
// instead. See lib/auth-role.ts and api/run/route.ts for the server-side
// enforcement this UI choice is backed by.
import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';

export function DemoRunBar({ sampleRunLabel }: { sampleRunLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border border-hair bg-elevated px-5 py-4">
        <div className="flex items-center gap-2 text-[13px] text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          <span>{sampleRunLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-accent/30 px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/10"
        >
          Preview run (demo)
        </button>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 px-6 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md border border-hair bg-elevated p-7"
            >
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">Live runs are gated</p>
              <h2 className="mt-3 font-serif text-[24px] text-ink">Real runs cost real money</h2>
              <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
                The picks above are a real APEX run, not a mockup, compared against actual results. Live runs are
                restricted to the admin account since each one costs real money to generate. Check the tracking
                page for the full, ongoing track record.
              </p>
              <div className="mt-6 flex items-center gap-4">
                <Link
                  href="/tracking"
                  className="rounded-md bg-ink px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-canvas transition-opacity hover:opacity-90"
                >
                  See the track record
                </Link>
                <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-ink-muted hover:text-ink-secondary">
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
