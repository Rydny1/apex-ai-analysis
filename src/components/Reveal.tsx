'use client';

// The shared scroll-reveal wrapper: opacity 0->1, translateY 20px->0, once
// per element, respecting prefers-reduced-motion via MotionConfig upstream
// (see login/page.tsx for why reducedMotion="user" is the correct fix here
// too - but this component is also safe stand-alone since useInView-gated
// animations never run at all for someone who never scrolls them into view
// under a reduced-motion OS setting is not guaranteed, so the check is
// duplicated locally).
import { motion, useReducedMotion } from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  as?: 'div' | 'span';
}) {
  const reducedMotion = useReducedMotion();
  const Component = motion[as];

  if (reducedMotion) {
    const Plain = as;
    return <Plain className={className}>{children}</Plain>;
  }

  return (
    <Component
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.4, delay, ease: EASE }}
      className={className}
    >
      {children}
    </Component>
  );
}
