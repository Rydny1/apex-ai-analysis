'use client';

// The one deliberately expressive screen in the app. Everywhere else stays
// restrained; this is the arrival moment, so it gets the full treatment:
// a depth-layered constellation field that webs itself to the cursor, a
// decode-and-settle wordmark, editorial underline fields whose rules draw in
// blue on focus, and a magnetic submit control.
//
// Deliberately black regardless of system theme - the same pattern Linear and
// Vercel use for sign-in, a distinct threshold before the quiet dashboard
// behind it. Built entirely on canvas 2D + transform/opacity + framer-motion:
// no WebGL, no video, no extra dependency, and no gradient anywhere except the
// single cursor spotlight and the button sheen.
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

type Mode = 'password' | 'reset-sent' | 'signup-sent';

const EASE = [0.16, 1, 0.3, 1] as const;

const fieldClass =
  'peer w-full border-0 bg-transparent px-0 pb-2 text-[13px] text-white outline-none ' +
  'placeholder:text-white/20 [color-scheme:dark]';

const labelClass =
  'pointer-events-none absolute left-0 top-0 text-[10px] font-medium uppercase tracking-[0.16em] ' +
  'text-white/35 transition-colors duration-300 peer-focus:text-blue';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    router.push('/run');
    router.refresh();
  }

  async function handleSignUp() {
    if (!email || !password) {
      reportError('Enter an email and password first.');
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
      router.push('/run');
      router.refresh();
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
    <div className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden bg-black">
      {/* Scoped to this screen only - globals.css is left alone. Chrome's
          autofill styling would otherwise paint an opaque pale box straight
          through the glass panel. */}
      <style>{`
        .apex-login input:-webkit-autofill,
        .apex-login input:-webkit-autofill:hover,
        .apex-login input:-webkit-autofill:focus {
          -webkit-text-fill-color: #ffffff;
          -webkit-box-shadow: 0 0 0 1000px transparent inset;
          transition: background-color 9999s ease-in-out 0s;
          caret-color: #ffffff;
        }
      `}</style>

      <LoginBackground />

      {/* Vignette: grounds the edges so the constellation reads as atmosphere
          behind the content rather than noise competing with it. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at 50% 44%, transparent 0%, rgba(0,0,0,0.62) 76%)',
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

      <main className="apex-login relative z-10 w-full max-w-[344px] px-6">
        <div className="text-center">
          <h1 className="tabular -mr-[0.34em] text-[38px] leading-none tracking-[0.34em] text-white">
            <ScrambleText text="APEX" delay={140} stagger={100} settle={360} />
          </h1>

          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.75, ease: EASE }}
            className="mx-auto mt-7 h-px w-10 origin-center bg-blue"
            aria-hidden="true"
          />

          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9, ease: EASE }}
            className="mt-5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/40"
          >
            Sign in to continue
          </motion.p>
          <Link href="/about" className="mt-2 inline-block text-[10px] text-white/30 hover:text-white/60">
            What is APEX?
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={cardControls}
          className="mt-10 rounded-md border border-white/[0.09] bg-black/45 p-7 backdrop-blur-[10px]"
        >
          {/* No `initial={false}` here: AnimatePresence pushes that down through
              presence context to every nested motion element, which would
              silently cancel the staggered field entrances below. */}
          <AnimatePresence mode="wait">
            {mode === 'signup-sent' ? (
              <motion.div key="signup-sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: EASE }}>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-blue">Account created</p>
                <p className="mt-3 text-[13px] leading-relaxed text-white/75">
                  Check your inbox to confirm your email, then sign in.
                </p>
                <button type="button" onClick={() => setMode('password')} className="mt-6 text-[11px] text-white/45 hover:text-white/85">
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
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-blue">
                  Link sent
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-white/75">
                  Check your inbox for a link to set a new password.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('password')}
                  className="group/back mt-6 text-[11px] text-white/45 transition-colors hover:text-white/85"
                >
                  <span className="relative">
                    Back to sign in
                    <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-white/50 transition-transform duration-300 group-hover/back:scale-x-100" />
                  </span>
                </button>
              </motion.div>
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
                  {/* White fill, black text: 21:1, and it keeps blue rare enough
                      to stay meaningful. The sheen goes dark on a light face. */}
                  <MagneticButton
                    type="submit"
                    strength={0.1}
                    disabled={status === 'submitting'}
                    className="w-full rounded-md bg-white px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-black [--sheen:rgba(0,0,0,0.11)] transition-opacity disabled:pointer-events-none disabled:opacity-55"
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
                      className="group/link text-[11px] text-white/40 transition-colors hover:text-white/80 focus-visible:text-white/80 focus-visible:outline-none"
                    >
                      <span className="relative">
                        Forgot password?
                        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-blue transition-transform duration-300 ease-out group-hover/link:scale-x-100 group-focus-visible/link:scale-x-100" />
                      </span>
                    </button>
                    <span className="text-white/20">·</span>
                    <button
                      type="button"
                      onClick={handleSignUp}
                      className="group/link2 text-[11px] text-white/40 transition-colors hover:text-white/80 focus-visible:text-white/80 focus-visible:outline-none"
                    >
                      <span className="relative">
                        Create account
                        <span className="absolute -bottom-0.5 left-0 h-px w-full origin-left scale-x-0 bg-blue transition-transform duration-300 ease-out group-hover/link2:scale-x-100 group-focus-visible/link2:scale-x-100" />
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
                      className="text-[11px] leading-relaxed text-red"
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

// The field rule: a static hairline with a blue rule that draws across it from
// the left on focus. scaleX only - nothing here touches width.
function Underline() {
  return (
    <>
      <span aria-hidden="true" className="absolute bottom-0 left-0 h-px w-full bg-white/15" />
      <span
        aria-hidden="true"
        className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 bg-blue transition-transform duration-500 ease-out peer-focus:scale-x-100"
      />
    </>
  );
}
