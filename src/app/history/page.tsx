import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { createClient } from '@/lib/supabase/server';

// History: past runs, simplest possible list - no visual complexity. Click a
// run to see its full picks table and no-pick log at /results/[runId]. The
// analytics (hit rate, ROI, CLV, tier breakdown) live on /tracking instead.
export default async function HistoryPage() {
  const supabase = await createClient();
  const { data: runs } = await supabase
    .from('runs')
    .select('id, started_at, status, entered_count, dropped_count, cost_usd')
    .order('started_at', { ascending: false })
    .limit(50);

  return (
    <AppShell>
      <h1 className="text-[15px] font-medium text-ink">History</h1>

      {!runs || runs.length === 0 ? (
        <p className="mt-6 text-[13px] text-ink-muted">No runs yet.</p>
      ) : (
        <div className="mt-6 divide-y divide-hair border border-hair">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/results/${run.id}`}
              className="flex items-center justify-between px-4 py-3 text-[13px] transition-colors hover:bg-inset"
            >
              <span className="text-ink">{new Date(run.started_at).toLocaleString()}</span>
              <span className="flex items-center gap-4 text-ink-muted">
                <span
                  className={
                    run.status === 'completed' ? 'text-accent' : run.status === 'failed' ? 'text-loss' : 'text-ink-muted'
                  }
                >
                  {run.status}
                </span>
                <span className="tabular font-mono">{run.entered_count} entered</span>
                <span className="tabular font-mono">${Number(run.cost_usd).toFixed(2)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
