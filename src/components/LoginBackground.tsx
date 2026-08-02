'use client';

// The one deliberately expressive surface in the app: a constellation field
// with real depth. Every node carries a `z` (0 = far, 1 = near) that drives its
// size, brightness, drift speed and how far it parallaxes against the pointer,
// so the field reads as three-dimensional without a second canvas or any WebGL.
//
// The blue accent appears in exactly one place here - nodes close enough to the
// cursor light up and web themselves to it. Everywhere else the field is white
// on black. That rarity is what makes the blue register.
//
// Performance contract:
//  - ONE canvas, ONE shared rAF loop, ONE pointermove listener. Never per-node
//    React state, never a re-render per frame.
//  - Only canvas redraws plus CSS custom properties on a single spotlight div.
//    No layout property is animated anywhere.
//  - `globalAlpha` (a number) varies per line instead of building a new rgba
//    string per line, so the hot loop allocates nothing.
//  - The loop stops entirely when the tab is hidden, and never starts under
//    prefers-reduced-motion (the field still paints one static frame).
import { useEffect, useRef } from 'react';

interface Node {
  x: number;
  y: number;
  /** Baseline drift - constant, so the field never settles into stillness. */
  bvx: number;
  bvy: number;
  /** Cursor-induced impulse, damped back toward zero each frame. */
  vx: number;
  vy: number;
  /** Depth, 0 (far) to 1 (near). */
  z: number;
  /** Twinkle phase offset so nodes don't pulse in lockstep. */
  phase: number;
}

// Matches --blue in dark mode. The login screen is always black, so this is
// pinned rather than read from the token, which would resolve to the light-mode
// blue whenever the OS is in light mode.
const BLUE = '91, 141, 239';

const PULL_RADIUS = 150;
const PULL_RADIUS_SQ = PULL_RADIUS * PULL_RADIUS;
const WEB_RADIUS = 190;
const WEB_RADIUS_SQ = WEB_RADIUS * WEB_RADIUS;
const WRAP_MARGIN = 60;

export function LoginBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const spotlight = spotlightRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let nodes: Node[] = [];
    // Rendered (parallaxed) coordinates, reused every frame rather than
    // reallocated - the link pass reads these instead of recomputing depth
    // offsets inside the O(n²) loop.
    let renderX = new Float32Array(0);
    let renderY = new Float32Array(0);
    let rafId = 0;

    // `x`/`y` are written by the pointer listener; `sx`/`sy` are eased toward
    // them inside the draw loop so the parallax glides instead of snapping.
    const pointer = { x: -9999, y: -9999, sx: -9999, sy: -9999, active: false };

    // Measures and (re)populates. Called by a ResizeObserver rather than on
    // mount + window resize: at mount the canvas can still report a zero-width
    // box, which silently produced an empty backbuffer and no visible field at
    // all. The observer fires once the element actually has a layout box, and
    // again for any container change a window resize wouldn't catch.
    function resize() {
      if (!canvas) return;
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (nextWidth === 0 || nextHeight === 0) return;

      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.round((width * height) / 15000);
      const count = Math.max(34, Math.min(88, target));

      // Only re-seed when the density target actually moves. Otherwise the
      // existing nodes are kept and the wrap logic walks them back into the new
      // bounds, so dragging a window doesn't reshuffle the whole sky.
      if (nodes.length === count) return;

      nodes = Array.from({ length: count }, () => {
        // Bias toward the far field so the near, bright nodes stay a minority -
        // that imbalance is what sells the depth.
        const z = Math.pow(Math.random(), 1.7);
        const speed = 0.05 + z * 0.14;
        const angle = Math.random() * Math.PI * 2;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          bvx: Math.cos(angle) * speed,
          bvy: Math.sin(angle) * speed,
          vx: 0,
          vy: 0,
          z,
          phase: Math.random() * Math.PI * 2,
        };
      });

      renderX = new Float32Array(count);
      renderY = new Float32Array(count);
    }

    function onPointerMove(event: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      if (!pointer.active) {
        pointer.active = true;
        pointer.sx = pointer.x;
        pointer.sy = pointer.y;
        if (spotlight) spotlight.style.opacity = '1';
      }
      if (spotlight) {
        spotlight.style.setProperty('--mx', `${pointer.x}px`);
        spotlight.style.setProperty('--my', `${pointer.y}px`);
      }
    }

    function onPointerLeave() {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
      if (spotlight) spotlight.style.opacity = '0';
    }

    function draw(now: number) {
      if (!ctx) return;
      if (width === 0 || height === 0) {
        if (!prefersReducedMotion) rafId = requestAnimationFrame(draw);
        return;
      }

      pointer.sx += (pointer.active ? pointer.x - pointer.sx : 0) * 0.07;
      pointer.sy += (pointer.active ? pointer.y - pointer.sy : 0) * 0.07;

      // Whole-field parallax: the near layer swings further than the far one.
      const originX = pointer.active ? (pointer.sx - width / 2) * -0.022 : 0;
      const originY = pointer.active ? (pointer.sy - height / 2) * -0.022 : 0;

      ctx.clearRect(0, 0, width, height);

      const count = nodes.length;
      for (let i = 0; i < count; i++) {
        const node = nodes[i];

        if (!prefersReducedMotion) {
          if (pointer.active) {
            const dx = pointer.x - node.x;
            const dy = pointer.y - node.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < PULL_RADIUS_SQ && distSq > 1) {
              // A gentle lean toward the cursor, stronger the nearer the node
              // sits in depth - it feels like the front layer notices you first.
              const dist = Math.sqrt(distSq);
              const pull = (1 - dist / PULL_RADIUS) * 0.014 * (0.35 + node.z);
              node.vx += (dx / dist) * pull;
              node.vy += (dy / dist) * pull;
            }
          }
          node.vx *= 0.97;
          node.vy *= 0.97;
          node.x += node.bvx + node.vx;
          node.y += node.bvy + node.vy;

          // Wrap rather than bounce: bouncing reveals the frame edges and makes
          // the field feel boxed in.
          if (node.x < -WRAP_MARGIN) node.x = width + WRAP_MARGIN;
          else if (node.x > width + WRAP_MARGIN) node.x = -WRAP_MARGIN;
          if (node.y < -WRAP_MARGIN) node.y = height + WRAP_MARGIN;
          else if (node.y > height + WRAP_MARGIN) node.y = -WRAP_MARGIN;
        }

        const depthShift = 0.2 + node.z;
        renderX[i] = node.x + originX * depthShift;
        renderY[i] = node.y + originY * depthShift;
      }

      // --- Link pass: white, alpha by proximity and by combined depth --------
      const linkDistance = Math.max(88, Math.min(width, height) / 5.5);
      const linkDistanceSq = linkDistance * linkDistance;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.55;
      for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = renderX[i] - renderX[j];
          const dy = renderY[i] - renderY[j];
          const distSq = dx * dx + dy * dy;
          if (distSq >= linkDistanceSq) continue;
          const closeness = 1 - Math.sqrt(distSq) / linkDistance;
          const depth = (nodes[i].z + nodes[j].z) * 0.5;
          ctx.globalAlpha = closeness * closeness * (0.05 + depth * 0.17);
          ctx.beginPath();
          ctx.moveTo(renderX[i], renderY[i]);
          ctx.lineTo(renderX[j], renderY[j]);
          ctx.stroke();
        }
      }

      // --- Cursor web: the only blue in the composition ----------------------
      if (pointer.active) {
        ctx.strokeStyle = `rgba(${BLUE}, 1)`;
        ctx.lineWidth = 0.7;
        for (let i = 0; i < count; i++) {
          const dx = pointer.x - renderX[i];
          const dy = pointer.y - renderY[i];
          const distSq = dx * dx + dy * dy;
          if (distSq >= WEB_RADIUS_SQ) continue;
          const closeness = 1 - Math.sqrt(distSq) / WEB_RADIUS;
          ctx.globalAlpha = closeness * closeness * 0.55;
          ctx.beginPath();
          ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(renderX[i], renderY[i]);
          ctx.stroke();
        }
      }

      // --- Node pass ---------------------------------------------------------
      for (let i = 0; i < count; i++) {
        const node = nodes[i];
        const twinkle = prefersReducedMotion
          ? 1
          : 0.82 + 0.18 * Math.sin(now * 0.0011 + node.phase);
        const radius = 0.5 + node.z * 1.5;

        let lit = 0;
        if (pointer.active) {
          const dx = pointer.x - renderX[i];
          const dy = pointer.y - renderY[i];
          const distSq = dx * dx + dy * dy;
          if (distSq < WEB_RADIUS_SQ) {
            const closeness = 1 - Math.sqrt(distSq) / WEB_RADIUS;
            lit = closeness * closeness;
          }
        }

        if (lit > 0.02) {
          // A soft halo, drawn as a second low-alpha disc rather than with
          // shadowBlur - shadowBlur is far more expensive per draw.
          ctx.fillStyle = `rgba(${BLUE}, 1)`;
          ctx.globalAlpha = lit * 0.16;
          ctx.beginPath();
          ctx.arc(renderX[i], renderY[i], radius + 4.5 * lit, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = (0.2 + node.z * 0.7) * twinkle;
          ctx.beginPath();
          ctx.arc(renderX[i], renderY[i], radius + lit * 0.8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.globalAlpha = (0.16 + node.z * 0.62) * twinkle;
          ctx.beginPath();
          ctx.arc(renderX[i], renderY[i], radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;

      if (!prefersReducedMotion) rafId = requestAnimationFrame(draw);
    }

    function start() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(draw);
    }

    function onVisibilityChange() {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else if (!prefersReducedMotion) {
        start();
      }
    }

    resize();
    start();

    // Fires immediately with the real box, then on any subsequent change. Under
    // reduced motion this is also what repaints the single static frame after a
    // resize, since no rAF loop is running to do it.
    const observer = new ResizeObserver(() => {
      resize();
      if (prefersReducedMotion) draw(performance.now());
    });
    observer.observe(canvas);

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
      {/* The single cursor-tracking spotlight. Position comes from CSS custom
          properties written by the one pointermove listener above - never from
          React state, which would re-render the tree on every mouse move. */}
      <div
        ref={spotlightRef}
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-700"
        style={
          {
            '--mx': '50%',
            '--my': '50%',
            background:
              `radial-gradient(420px circle at var(--mx) var(--my), rgba(${BLUE},0.13), transparent 68%)`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      />
    </>
  );
}
