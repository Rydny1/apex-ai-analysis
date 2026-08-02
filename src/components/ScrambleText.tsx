'use client';

// A decode/settle text reveal: each glyph cycles through a small set of
// technical characters and then locks into its final letter, left to right.
// Used once, for the APEX wordmark on the login screen.
//
// Performance notes:
//  - One rAF loop for the whole string, and it stops the moment the last
//    character settles. No interval, no timers left running.
//  - Characters are written straight to the DOM through refs. Scrambling via
//    React state would mean a re-render per frame per character, which is
//    exactly the thing the rest of this app avoids.
//  - Only `textContent` and `opacity` change - no layout property is touched,
//    and the monospace stack keeps every glyph the same width so nothing
//    reflows while the string is still resolving.
import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';

// Deliberately restrained: technical punctuation only, no letters or digits,
// so the scramble reads as "resolving" rather than as a different word.
const GLYPHS = '/\\|<>[]{}=+-_*^~:.';

interface ScrambleTextProps {
  text: string;
  className?: string;
  /** Delay before the decode starts, ms. */
  delay?: number;
  /** Gap between one character settling and the next, ms. */
  stagger?: number;
  /** How long the first character scrambles before it settles, ms. */
  settle?: number;
}

export function ScrambleText({
  text,
  className,
  delay = 0,
  stagger = 95,
  settle = 380,
}: ScrambleTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const chars = Array.from(root.querySelectorAll<HTMLSpanElement>('[data-scramble-char]'));
    if (chars.length === 0) return;

    // Reduced motion: no decode at all, just present the finished wordmark.
    if (reducedMotion) {
      chars.forEach((span, i) => {
        span.textContent = text[i] ?? '';
        span.style.opacity = '1';
      });
      return;
    }

    const start = performance.now();
    let lastSwap = 0;
    let rafId = 0;

    function frame(now: number) {
      const elapsed = now - start - delay;
      let settled = true;

      if (elapsed >= 0) {
        // Glyphs swap on their own slower cadence than the frame rate, so the
        // scramble reads as a mechanism resolving rather than as static noise.
        const swap = now - lastSwap > 42;
        if (swap) lastSwap = now;

        for (let i = 0; i < chars.length; i++) {
          const span = chars[i];
          const settleAt = settle + i * stagger;
          if (elapsed >= settleAt) {
            const final = text[i] ?? '';
            if (span.textContent !== final) {
              span.textContent = final;
              span.style.opacity = '1';
            }
          } else {
            settled = false;
            // Ramp toward full opacity as each character approaches its lock.
            span.style.opacity = (0.2 + (elapsed / settleAt) * 0.55).toFixed(3);
            if (swap) span.textContent = GLYPHS[(Math.random() * GLYPHS.length) | 0];
          }
        }
      } else {
        settled = false;
      }

      if (!settled) rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [text, delay, stagger, settle, reducedMotion]);

  return (
    <span ref={rootRef} className={className}>
      {/* The real string for assistive tech - the animated glyphs below are
          decorative noise until they settle, so they stay hidden from it. */}
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {text.split('').map((char, i) => (
          <span
            key={i}
            data-scramble-char=""
            style={{ display: 'inline-block', opacity: 0 }}
          >
            {char}
          </span>
        ))}
      </span>
    </span>
  );
}
