import { notFound } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { StatTile } from '@/components/StatTile';
import { PicksTable, type PickRow } from '@/components/PicksTable';
import { NoPickLog, type NoPickRow } from '@/components/NoPickLog';
import { createClient } from '@/lib/supabase/server';

// The detail view for one specific run - reached from the History page's run
// list, or immediately after a fresh run completes. Same table components as
// the dashboard's "latest run" zone, just scoped to whichever run this is.
export default async function ResultsPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createClient();

  // All three only need runId, not each other's results, so they can fire
  // together instead of waiting on the run row before starting the rest.
  const [{ data: run }, { data: matches }, { data: runPicks }] = await Promise.all([
    supabase.from('runs').select('*').eq('id', runId).maybeSingle(),
    supabase.from('matches').select('*').eq('run_id', runId),
    supabase.from('picks').select('*').eq('run_id', runId),
  ]);
  if (!run) notFound();

  const matchById = new Map((matches ?? []).map((m) => [m.id, m]));
  const placedPicks = (runPicks ?? []).filter((p) => p.is_pick);
  const rejectedPicks = (runPicks ?? []).filter((p) => !p.is_pick);
  const droppedMatches = (matches ?? []).filter((m) => m.stage === 'dropped');

  const picks: PickRow[] = placedPicks.map((pick) => {
    const match = matchById.get(pick.match_id);
    return {
      id: pick.id,
      matchLabel: match ? `${match.home_team} vs ${match.away_team}` : '—',
      competition: match?.competition ?? '',
      market: pick.market,
      line: pick.line,
      tier: pick.tier,
      entryOdds: pick.entry_odds !== null ? Number(pick.entry_odds) : null,
      probability: Number(pick.probability),
      edge: pick.edge !== null ? Number(pick.edge) : null,
      stakePct: Number(pick.stake_pct),
      modelConfidence: Number(pick.model_confidence),
      dataConfidence: Number(pick.data_confidence),
      lineupConfidence: Number(pick.lineup_confidence),
    };
  });

  const noPickRows: NoPickRow[] = [
    ...rejectedPicks.map((pick) => {
      const match = matchById.get(pick.match_id);
      return { id: pick.id, label: match ? `${match.home_team} vs ${match.away_team}` : '—', reason: pick.no_pick_reason ?? '' };
    }),
    ...droppedMatches.map((match) => ({ id: match.id, label: `${match.home_team} vs ${match.away_team}`, reason: match.drop_reason ?? '' })),
  ];

  return (
    <AppShell>
      <div className="flex items-baseline justify-between">
        <h1 className="text-[15px] font-medium text-ink">Results</h1>
        <span className="text-[13px] text-ink-muted">{new Date(run.started_at).toLocaleString()}</span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Scanned" value={String(run.scanned_count)} />
        <StatTile label="Entered" value={String(run.entered_count)} />
        <StatTile label="Picks placed" value={String(placedPicks.length)} />
        <StatTile label="Cost" value={`$${Number(run.cost_usd).toFixed(2)}`} />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">Picks</h2>
        <PicksTable picks={picks} />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">No-pick log</h2>
        <NoPickLog rows={noPickRows} />
      </div>
    </AppShell>
  );
}
