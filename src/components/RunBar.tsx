'use client';

// Zone 1 of the run page: a single horizontal bar. Idle, it shows the last run's
// one-line summary and the trigger button. Mid-run, the whole bar becomes a live
// progress indicator - real percentage and stage name, polled from the `runs` row
// that /api/run's background work (see route.ts's use of `after()`) updates as it
// goes, not a fake animated bar standing in for actual progress.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';

export interface LastRunSummary {
  startedAt: string;
  scanned: number;
  entered: number;
  picks: number;
}

export function RunBar({
  lastRun,
  runsToday,
  maxRunsPerDay,
  initiallyDisabled,
  disabledReason,
}: {
  lastRun: LastRunSummary | null;
  runsToday: number;
  maxRunsPerDay: number;
  initiallyDisabled: boolean;
  disabledReason: string | null;
}) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'error'>('idle');
  const [progressPct, setProgressPct] = useState(0);
  const [stage, setStage] = useState('Starting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [etaLabel, setEtaLabel] = useState<string | null>(null);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runStartedAtRef = useRef<number>(0);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function handleRun() {
    setPhase('running');
    setProgressPct(0);
    setStage('Starting');
    setErrorMessage(null);
    setEtaLabel(null);
    runStartedAtRef.current = Date.now();

    const response = await fetch('/api/run', { method: 'POST' });
    const body = await response.json();
    if (!response.ok) {
      setPhase('error');
      setErrorMessage(body.error ?? 'The run could not be started.');
      return;
    }

    const supabase = createClient();
    const runId = body.runId as string;

    pollRef.current = setInterval(async () => {
      const { data } = await supabase.from('runs').select('status, progress_pct, progress_stage').eq('id', runId).single();
      if (!data) return;
      setProgressPct(data.progress_pct);
      setStage(data.progress_stage);

      // Simple linear projection from elapsed time and percent complete - good
      // enough for "a few minutes left", not a promise of precision.
      if (data.progress_pct > 2) {
        const elapsedMs = Date.now() - runStartedAtRef.current;
        const remainingMs = (elapsedMs / data.progress_pct) * (100 - data.progress_pct);
        setEtaLabel(formatEta(remainingMs));
      }

      if (data.status === 'completed') {
        if (pollRef.current) clearInterval(pollRef.current);
        router.push(`/results/${runId}`);
      } else if (data.status === 'failed') {
        if (pollRef.current) clearInterval(pollRef.current);
        setPhase('error');
        setErrorMessage('The run failed partway through - see the results page for what was priced before it stopped.');
      }
    }, 1200);
  }

  const isDisabled = phase === 'running' || initiallyDisabled;

  return (
    <div className="border border-hair bg-elevated px-5 py-4">
      <AnimatePresence mode="wait">
        {phase === 'running' ? (
          <motion.div key="running" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
            <div className="flex items-center justify-between text-[13px]">
              <span className="flex items-center gap-2 text-ink">
                <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                {stage}
              </span>
              <span className="tabular font-mono text-ink-muted">
                {progressPct}%{etaLabel ? ` · ${etaLabel} left` : ''}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-hair">
              <motion.div
                className="h-full rounded-full bg-accent"
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2 text-[13px] text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              {lastRun ? (
                <span>
                  Last run: {formatRunLine(lastRun)}
                </span>
              ) : (
                <span className="text-ink-muted">No runs yet</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="tabular font-mono text-[13px] text-ink-muted">
                {runsToday} of {maxRunsPerDay} runs today
              </span>
              <button
                type="button"
                onClick={handleRun}
                disabled={isDisabled}
                title={isDisabled ? (disabledReason ?? undefined) : undefined}
                className="flex min-h-[44px] items-center gap-1.5 rounded-md border border-accent/40 px-3 py-1.5 text-[13px] font-medium text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlayIcon />
                Run analysis
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {errorMessage ? <p className="mt-2 text-[11px] text-loss">{errorMessage}</p> : null}
    </div>
  );
}

function formatEta(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.round(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatRunLine(run: LastRunSummary): string {
  const date = new Date(run.startedAt).toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${date} · ${run.scanned} scanned · ${run.entered} analyzed · ${run.picks} picks`;
}

function PlayIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M1 0.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}
