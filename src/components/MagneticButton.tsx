'use client';

// A button that leans toward the cursor within its own bounds, with a sheen
// that tracks the pointer across its face and a label that parallaxes slightly
// further than the button itself. Three small moves that together make it feel
// like a physical control rather than a rectangle.
//
// Performance contract:
//  - The magnet is transform-only (translate via framer-motion springs). No
//    layout property is ever animated.
//  - The sheen is a CSS custom property written straight to the element and
//    rAF-throttled, so a fast mouse can't queue more style writes than there
//    are frames. It only paints while the button is hovered.
//  - Under prefers-reduced-motion the magnet and sheen are both inert and the
//    button behaves as a plain static control.
import { useCallback, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

// framer-motion redefines the drag and animation event handlers with its own
// signatures, so React's versions have to be dropped from the surface we accept
// rather than suppressed at the spread site. No consumer passes them.
type NativeButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onDrag' | 'onDragStart' | 'onDragEnd' | 'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration'
>;

interface MagneticButtonProps extends NativeButtonProps {
  /** How far the button leans, as a fraction of cursor offset from center. */
  strength?: number;
}

const SPRING = { stiffness: 260, damping: 22, mass: 0.5 } as const;

export function MagneticButton({
  children,
  className = '',
  strength = 0.16,
  ...props
}: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const frameRef = useRef(0);
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  const reducedMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, SPRING);
  const springY = useSpring(y, SPRING);
  // The label travels a little further than the shell - the small mismatch is
  // what reads as depth rather than as the whole thing sliding.
  const labelX = useTransform(springX, (value) => value * 0.32);
  const labelY = useTransform(springY, (value) => value * 0.32);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const flush = useCallback(() => {
    frameRef.current = 0;
    const point = pendingRef.current;
    const node = ref.current;
    if (!point || !node) return;
    node.style.setProperty('--mx', `${point.x}px`);
    node.style.setProperty('--my', `${point.y}px`);
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const node = ref.current;
      if (!node || props.disabled) return;
      const rect = node.getBoundingClientRect();
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;

      pendingRef.current = { x: localX, y: localY };
      if (!frameRef.current) frameRef.current = requestAnimationFrame(flush);

      if (reducedMotion) return;
      x.set((localX - rect.width / 2) * strength);
      y.set((localY - rect.height / 2) * strength * 1.5);
    },
    [flush, props.disabled, reducedMotion, strength, x, y],
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      style={{ x: springX, y: springY }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`group relative isolate overflow-hidden ${className}`}
      {...props}
    >
      {/* Cursor-tracking sheen. Fades in on hover; its position comes from the
          rAF-throttled custom properties above. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          // --sheen lets the caller invert it: a light wash on a dark button,
          // a dark one on a light button. Set via an arbitrary property class.
          background:
            'radial-gradient(110px circle at var(--mx, 50%) var(--my, 50%), var(--sheen, rgba(255,255,255,0.42)), transparent 62%)',
        }}
      />
      <motion.span
        style={reducedMotion ? undefined : { x: labelX, y: labelY }}
        className="relative flex items-center justify-center gap-2"
      >
        {children}
      </motion.span>
    </motion.button>
  );
}
