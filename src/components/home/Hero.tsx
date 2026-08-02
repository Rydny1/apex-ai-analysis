'use client';

// The hero: grid lines behind, aurora drifting on top of the grid, headline
// words staggering in on mount (the hero itself has no scroll-gated reveal -
// it must be there on first paint, same rule as the login screen). A subtle
// 5-dot cursor trail is confined to this section only, per the redesign
// brief's "design room" list - not everywhere, not on mobile.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

const HEADLINE_LINE_1 = ['Football,', 'priced'];
const HEADLINE_LINE_2 = 'before the market catches up.';

export function Hero({ picksThisWeek }: { picksThisWeek: number }) {
  const reducedMotion = useReducedMotion();
  const heroRef = useRef<HTMLDivElement>(null);
  const [trail, setTrail] = useState<{ x: number; y: number; id: number }[]>([]);
  const trailId = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;
    const el = heroRef.current;
    if (!el) return;
    const isTouch = window.matchMedia('(pointer: coarse)').matches;
    if (isTouch) return;

    let lastEmit = 0;
    function onMove(event: PointerEvent) {
      const now = performance.now();
      if (now - lastEmit < 60) return;
      lastEmit = now;
      const rect = el!.getBoundingClientRect();
      trailId.current += 1;
      const id = trailId.current;
      setTrail((prev) => [...prev.slice(-4), { x: event.clientX - rect.left, y: event.clientY - rect.top, id }]);
      window.setTimeout(() => {
        setTrail((prev) => prev.filter((d) => d.id !== id));
      }, 500);
    }
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, [reducedMotion]);

  return (
    <div ref={heroRef} className="relative overflow-hidden bg-canvas pt-32">
      {/* Grid lines behind everything. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
        aria-hidden="true"
      />

      {/* Aurora, layered on top of the grid. */}
      <div
        className="aurora-ambient pointer-events-none absolute left-1/2 top-[10%] h-[560px] w-[720px] -translate-x-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)', filter: 'blur(90px)' }}
        aria-hidden="true"
      />

      {trail.map((dot) => (
        <span
          key={dot.id}
          className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-accent/50 transition-opacity duration-500"
          style={{ left: dot.x, top: dot.y, transform: 'translate(-50%, -50%)' }}
          aria-hidden="true"
        />
      ))}

      <div className="relative z-10 mx-auto max-w-6xl px-6 pb-20 sm:px-8">
        <motion.div
          initial={reducedMotion ? undefined : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-hair bg-elevated px-3 py-1.5"
        >
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent-dim)]" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-secondary">Live · {picksThisWeek} picks this week</span>
        </motion.div>

        <h1 className="mt-8 font-serif leading-[0.95] tracking-[-0.03em] text-ink" style={{ fontSize: 'clamp(44px, 5.2vw, 82px)' }}>
          <Words words={HEADLINE_LINE_1} reducedMotion={!!reducedMotion} startDelay={0.05} />
          <br />
          <span className="italic text-accent">
            <Words words={[HEADLINE_LINE_2]} reducedMotion={!!reducedMotion} startDelay={0.17} />
          </span>
        </h1>

        <motion.p
          initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="mt-6 max-w-[520px] text-[17px] font-light leading-relaxed text-ink-secondary"
        >
          A disciplined pre-match analysis system. Every pick priced against the closing line, tracked for edge,
          and only shown when the numbers earn it.
        </motion.p>

        <motion.div
          initial={reducedMotion ? undefined : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mt-9 flex flex-wrap items-center gap-4"
        >
          <Link
            href="/login"
            className="min-h-[44px] rounded-md bg-ink px-6 py-3 text-[13px] font-semibold text-canvas transition-transform hover:scale-[1.02]"
          >
            Try demo run →
          </Link>
          <a
            href="#how-it-works"
            className="min-h-[44px] rounded-md border border-hair px-6 py-3 text-[13px] font-medium text-ink-secondary transition-colors hover:border-strong hover:text-ink"
          >
            Read the model
          </a>
        </motion.div>
      </div>
    </div>
  );
}

function Words({ words, reducedMotion, startDelay }: { words: string[]; reducedMotion: boolean; startDelay: number }) {
  return (
    <>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={reducedMotion ? undefined : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: startDelay + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="inline-block"
        >
          {word}
          {i < words.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </>
  );
}
