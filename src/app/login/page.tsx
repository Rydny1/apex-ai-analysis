'use client';

// The one deliberately expressive screen in the app. Everywhere else stays
// restrained; this is the arrival moment, so it gets the full treatment:
// a depth-layered constellation field that webs itself to the cursor, a
// decode-and-settle wordmark, editorial underline fields whose rules draw in
// accent green on focus, and a magnetic submit control.
//
// Deliberately dark canvas regardless of system theme - the same pattern
// Linear and Vercel use for sign-in, a distinct threshold before the quiet
// dashboard behind it. Built entirely on canvas 2D + transform/opacity +
// framer-motion: no WebGL, no video, no extra dependency, and no gradient
// anywhere except the aurora glows and the button sheen.
//
// The choreography never gates interaction. Every field is mounted, focusable
// and typeable on first paint - only opacity and translate are animated, and
// the email input holds autofocus throughout.
import { useEffect, useState } from 'react';
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useAnimationControls,
  useReducedMotion,
} from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LoginBackground } from '@/components/LoginBackground';
import { MagneticButton } from '@/components/MagneticButton';
import { ScrambleText } from '@/components/ScrambleText';

type Mode = 'password' | 'signup-form' | 'reset-sent' | 'signup-sent';

const EASE = [0.16, 1, 0.3, 1] as const;

const fieldClass =
  'peer w-full border-0 bg-transparent px-0 pb-2 text-[13px] text-ink outline-none ' +
  'placeholder:text-ink-faint [color-scheme:dark]';

const labelClass =
  'pointer-events-none absolute left-0 top-0 text-[10px] font-medium uppercase tracking-[0.16em] ' +
  'text-ink-muted transition-colors duration-300 peer-focus:text-accent';

async function syncProfileThenGo(router: ReturnType<typeof useRouter>) {
  try {
    await fetch('/api/auth/sync-profile', { method: 'POST' });
  } catch {
    // Non-fatal - the role check on the server falls back to a direct email
    // comparison (see lib/auth-role.ts) if the profile row isn't there yet.
  }
  router.push('/run');
  router.refresh();
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [mode, setMode] = useState<Mode>('password');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  const reducedMotion = useReducedMotion();
  // One controls object drives the card's entrance and, later, its error shake.
  // Using controls for both avoids a wrapper element that exists only to own a
  // second `animate` prop - `animate` takes a target or controls, never both.
  const cardControls = useAnimationControls();

  useEffect(() => {
    void cardControls.start({
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, delay: 0.32, ease: EASE },
    });
  }, [cardControls]);

  // A short lateral shake on a rejected credential. Transform-only, and skipped
  // entirely under reduced motion - the error text alone carries it then.
  function reportError(message: string) {
    setStatus('error');
    setErrorMessage(message);
    if (!reducedMotion) {
      void cardControls.start({
        x: [0, -7, 6, -4, 2, 0],
        transition: { duration: 0.42, ease: 'easeInOut' },
      });
    }
  }

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    setErrorMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      reportError(error.message);
      return;
    }
    await syncProfileThenGo(router);
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      reportError('Enter an email and password first.');
      return;
    }
    if (!ageConfirmed) {
      reportError('Confirm you are 18 or older to continue.');
      return;
    }
    setStatus('submitting');
    setErrorMessage(null);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      reportError(error.message);
      return;
    }
    setStatus('idle');
    if (data.session) {
      await syncProfileThenGo(router);
      return;
    }
    setMode('signup-sent'); // Supabase project has email confirmation on - check inbox
  }

  async function handleForgotPassword() {
    if (!email) {
      reportError('Enter your email above first.');
      return;
    }
    setStatus('submitting');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      reportError(error.message);
      return;
    }
    setStatus('idle');
    setErrorMessage(null);
    setMode('reset-sent');
  }

  return (
    // globals.css's reduced-motion override only reaches CSS animations and
    // transitions - framer-motion drives inline transforms through its own rAF
    // loop and would sail straight past it. `reducedMotion="user"` is the
    // canonical fix: transform and layout animations are dropped for anyone who
    // asked, opacity still crossfades, so nothing ever snaps into place.
    <MotionConfig reducedMotion="user">
    <div className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden bg-canvas">
      {/* Scoped to this screen only - globals.css is left alone. Chrome's
          autofill styling would otherwise paint an opaque pale box straight
          through the glass panel. */}
      <style>{`
        .apex-login input:-webkit-autofill,
        .apex-login input:-webkit-autofill:hover,
        .apex-login input:-webkit-autofill:focus {
          -webkit-text-fill-color: #f5f4ef;
          -webkit-box-shadow: 0 0 0 1000px transparent inset;
          transition: background-color 9999s ease-in-out 0s;
          caret-color: #f5f4ef;
        }
      `}</style>

      <LoginBackground />

      {/* Ambient aurora behind the wordmark - the slow 20s drift, shared with
          the homepage hero. Pure atmosphere, never load-bearing. */}
      <div
        className="aurora-ambient pointer-events-none absolute left-1/2 top-[30%] h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, var(--accent-glow), transparent 70%)', filter: 'blur(60px)' }}
        aria-hidden="true"
      />

      {/* Vignette: grounds the edges so the constellation reads as atmosphere
          behind the content rather than noise competing with it. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 44%, transparent 0%, rgba(11,15,12,0.72) 76%)',
        }}
        aria-hidden="true"
      />

      {/* A single static grain plate. Costs nothing at runtime - no animation,
          no filter on a live layer - and it stops the flat black from reading
          as an empty div on a wide display. */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
        aria-hidden="true"
      />

      {/* A minimal top nav - just an escape hatch back to the homepage, kept
          deliberately quiet so it doesn't compete with the centered wordmark
          below. No sign-in link here; that would be redundant on this page. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-8">
        <Link href="/" className="text-[13px] text-ink-faint transition-colors hover:text-ink-secondary">
          ‹ Home
        </Link>
        <Link href="/about" target="_blank" rel="noopener noreferrer" className="text-[13px] text-ink-faint transition-colors hover:text-ink-secondary">
          About
        </Link>
      </div>

      <main className="apex-login relative z-10 w-full max-w-[344px] px-6">
        <div className="text-center">
          <h1 className="tabular -mr-[0.34em] text-[38px] leading-none tracking-[0.34em] text-ink">
            <ScrambleText text="APEX" delay={140} stagger={100} settle={360} />
          </h1>

          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.75, ease: EASE }}
            className="mx-auto mt-7 h-[1.5px] w-[60px] origin-center bg-accent"
            style={{ boxShadow: '0 0 8px var(--accent-dim)' }}
            aria-hidden="true"
          />

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9, ease: EASE }}
            className="mt-5 text-[10px] font-medium uppercase tracking-[0.22em] text-ink-muted"
          >
            {mode === 'signup-form' ? 'Create your account' : 'Sign in to continue'}
          </motion.p>
          <Link
            href="/about"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[10px] text-ink-faint hover:text-ink-secondary"
          >
            What is APEX?
          </Link>
        </div>

        <motion.div
          layout
          initial={{ opacity: 0, y: 14 }}
          animate={cardControls}
          transition={{ layout: { duration: 0.4, ease: EASE } }}
          className="mt-10 rounded-md border border-hair bg-elevated/[0.92] p-7 backdrop-blur-[10px]"
        >
          {/* No `initial={false}` here: AnimatePresence pushes that down through
              presence context to every nested motion element, which would
              silently cancel the staggered field entrances below. */}
          <AnimatePresence mode="wait">
            {mode === 'signup-sent' ? (
              <motion.div key="signup-sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE }}>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent">Account created</p>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
                  Check your inbox to confirm your email, then sign in.
                </p>
                <button type="button" onClick={() => setMode('password')} className="mt-6 text-[11px] text-ink-faint hover:text-ink-secondary">
                  Back to sign in
                </button>
              </motion.div>
            ) : mode === 'reset-sent' ? (
              <motion.div
                key="reset-sent"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, ease: EASE }}
              >
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
                  Link sent
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-secondary">
                  Check your inbox for a link to set a new password.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('password')}
                  className="group/back mt-6 text-[11px] text-ink-faint transition-colors hover:text-ink-secondary"
                >
                  <span className="relative">
                    Back to sign in
                    <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-ink-secondary transition-transform duration-300 group-hover/back:scale-x-100" />
                  </span>
                </button>
              </motion.div>
            ) : mode === 'signup-form' ? (
              <motion.form
                key="signup-form"
                onSubmit={handleSignUp}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="space-y-7"
              >
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.1, ease: EASE }}
                  className="relative pt-5"
                >
                  <input
                    id="apex-signup-email"
                    className={fieldClass}
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <label htmlFor="apex-signup-email" className={labelClass}>
                    Email
                  </label>
                  <Underline />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.16, ease: EASE }}
                  className="relative pt-5"
                >
                  <input
                    id="apex-signup-password"
                    className={fieldClass}
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label htmlFor="apex-signup-password" className={labelClass}>
                    Password
                  </label>
                  <Underline />
                </motion.div>

                <motion.label
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.22, ease: EASE }}
                  className="flex cursor-pointer items-start gap-2.5 pt-1 text-[12px] leading-relaxed text-ink-secondary"
                >
                  <input
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  I confirm I am 18 or older
                </motion.label>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.28, ease: EASE }}
                  className="space-y-4 pt-1"
                >
                  <MagneticButton
                    type="submit"
                    strength={0.1}
                    disabled={status === 'submitting'}
                    className="w-full rounded-md bg-ink px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-canvas [--sheen:rgba(10,10,11,0.14)] transition-opacity disabled:pointer-events-none disabled:opacity-55"
                  >
                    <span>{status === 'submitting' ? 'Creating account' : 'Create account'}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      className="transition-transform duration-500 ease-out group-hover:translate-x-1"
                    >
                      <path
                        d="M1 6h9M6.5 2.5 10 6l-3.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </MagneticButton>

                  <div className="flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setStatus('idle');
                        setMode('password');
                      }}
                      className="group/back text-[11px] text-ink-faint transition-colors hover:text-ink-secondary"
                    >
                      <span className="relative">
                        Already have an account? Sign in
                        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 ease-out group-hover/back:scale-x-100" />
                      </span>
                    </button>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {errorMessage ? (
                    <motion.p
                      key={errorMessage}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      role="alert"
                      className="text-[11px] leading-relaxed text-loss"
                    >
                      {errorMessage}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </motion.form>
            ) : (
              <motion.form
                key="password"
                onSubmit={handleSignIn}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="space-y-7"
              >
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.44, ease: EASE }}
                  className="relative pt-5"
                >
                  <input
                    id="apex-email"
                    className={fieldClass}
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <label htmlFor="apex-email" className={labelClass}>
                    Email
                  </label>
                  <Underline />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.52, ease: EASE }}
                  className="relative pt-5"
                >
                  <input
                    id="apex-password"
                    className={fieldClass}
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label htmlFor="apex-password" className={labelClass}>
                    Password
                  </label>
                  <Underline />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.6, ease: EASE }}
                  className="space-y-4 pt-1"
                >
                  <MagneticButton
                    type="submit"
                    strength={0.1}
                    disabled={status === 'submitting'}
                    className="w-full rounded-md bg-ink px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-canvas [--sheen:rgba(10,10,11,0.14)] transition-opacity disabled:pointer-events-none disabled:opacity-55"
                  >
                    <span>{status === 'submitting' ? 'Signing in' : 'Sign in'}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden="true"
                      className="transition-transform duration-500 ease-out group-hover:translate-x-1"
                    >
                      <path
                        d="M1 6h9M6.5 2.5 10 6l-3.5 3.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </MagneticButton>

                  <div className="flex items-center justify-center gap-4">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="group/link text-[11px] text-ink-faint transition-colors hover:text-ink-secondary focus-visible:text-ink-secondary"
                    >
                      <span className="relative">
                        Forgot password?
                        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 ease-out group-hover/link:scale-x-100 group-focus-visible/link:scale-x-100" />
                      </span>
                    </button>
                    <span className="text-ink-faint">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setErrorMessage(null);
                        setStatus('idle');
                        setMode('signup-form');
                      }}
                      className="group/link2 text-[11px] text-ink-faint transition-colors hover:text-ink-secondary focus-visible:text-ink-secondary"
                    >
                      <span className="relative">
                        Create account
                        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-300 ease-out group-hover/link2:scale-x-100 group-focus-visible/link2:scale-x-100" />
                      </span>
                    </button>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {errorMessage ? (
                    <motion.p
                      key={errorMessage}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: EASE }}
                      role="alert"
                      className="text-[11px] leading-relaxed text-loss"
                    >
                      {errorMessage}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
    </MotionConfig>
  );
}

// The field rule: a static hairline with an accent rule that draws across it
// from the left on focus. scaleX only - nothing here touches width.
function Underline() {
  return (
    <>
      <span aria-hidden="true" className="absolute bottom-0 left-0 h-px w-full bg-hair" />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-accent transition-transform duration-500 ease-out peer-focus:scale-x-100"
      />
    </>
  );
}
