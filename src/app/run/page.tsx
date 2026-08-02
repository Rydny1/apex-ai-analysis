import { AppShell } from '@/components/AppShell';
import { RunBar, type LastRunSummary } from '@/components/RunBar';
import { StatTile } from '@/components/StatTile';
import { PicksTable, type PickRow } from '@/components/PicksTable';
import { NoPickLog, type NoPickRow } from '@/components/NoPickLog';
import { createClient } from '@/lib/supabase/server';
import { config } from '@/lib/config';
import { summarizeSettlements, type SettlementResult } from '@/lib/engine/settlement';

// The dashboard - three zones stacked vertically, per the design brief: the run
// bar (trigger + live progress), the stats row (aggregate performance), and the
// picks table for the most recent run, which is the centerpiece of the page.
export default async function RunPage() {
  const supabase = await createClient();

  const sinceDate = new Date();
  sinceDate.setTime(sinceDate.getTime() - 24 * 60 * 60 * 1000);
  const since = sinceDate.toISOString();
  const { count: runsToday } = await supabase.from('runs').select('id', { count: 'exact', head: true }).gte('started_at', since);
  const { data: inFlight } = await supabase.from('runs').select('id').eq('status', 'running').limit(1);
  const isInFlight = Boolean(inFlight && inFlight.length > 0);
  const isOverDailyCap = (runsToday ?? 0) >= config.limits.maxRunsPerDay;

  const { data: latestRun } = await supabase
    .from('runs')
    .select('id, started_at, scanned_count, entered_count')
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: settlements } = await supabase.from('settlements').select('result, roi_pct, clv_pct');
  const summary = summarizeSettlements((settlements ?? []).map((s) => ({ result: s.result as SettlementResult, clvPct: s.clv_pct })));
  const totalRoiPct = (settlements ?? []).reduce((sum, s) => sum + (s.roi_pct ?? 0), 0);
  const avgClvPct =
    (settlements ?? []).filter((s) => s.clv_pct !== null).reduce((sum, s) => sum + (s.clv_pct ?? 0), 0) /
    Math.max(1, (settlements ?? []).filter((s) => s.clv_pct !== null).length);

  // Active picks = placed bets whose match hasn't settled yet. Computed as a
  // plain set difference rather than an embedded-resource filter - simpler to
  // get right than relying on PostgREST's left-join-then-filter-null semantics
  // inside a count-only (`head: true`) request.
  const { data: placedPickIds } = await supabase.from('picks').select('id').eq('is_pick', true);
  const { data: settledPickIds } = await supabase.from('settlements').select('pick_id');
  const settledSet = new Set((settledPickIds ?? []).map((s) => s.pick_id));
  const activePicksCount = (placedPickIds ?? []).filter((p) => !settledSet.has(p.id)).length;

  let lastRunSummary: LastRunSummary | null = null;
  let picks: PickRow[] = [];
  let noPickRows: NoPickRow[] = [];

  if (latestRun) {
    const { data: matches } = await supabase.from('matches').select('*').eq('run_id', latestRun.id);
    const { data: runPicks } = await supabase.from('picks').select('*').eq('run_id', latestRun.id);
    const matchById = new Map((matches ?? []).map((m) => [m.id, m]));
    const placedPicks = (runPicks ?? []).filter((p) => p.is_pick);
    const rejectedPicks = (runPicks ?? []).filter((p) => !p.is_pick);
    const droppedMatches = (matches ?? []).filter((m) => m.stage === 'dropped');

    lastRunSummary = {
      startedAt: latestRun.started_at,
      scanned: latestRun.scanned_count,
      entered: latestRun.entered_count,
      picks: placedPicks.length,
    };

    picks = placedPicks.map((pick) => {
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

    noPickRows = [
      ...rejectedPicks.map((pick) => {
        const match = matchById.get(pick.match_id);
        return { id: pick.id, label: match ? `${match.home_team} vs ${match.away_team}` : '—', reason: pick.no_pick_reason ?? '' };
      }),
      ...droppedMatches.map((match) => ({ id: match.id, label: `${match.home_team} vs ${match.away_team}`, reason: match.drop_reason ?? '' })),
    ];
  }

  return (
    <AppShell>
      <RunBar
        lastRun={lastRunSummary}
        runsToday={runsToday ?? 0}
        maxRunsPerDay={config.limits.maxRunsPerDay}
        initiallyDisabled={isInFlight || isOverDailyCap}
        disabledReason={
          isInFlight
            ? 'A run is already in progress.'
            : isOverDailyCap
              ? `Max ${config.limits.maxRunsPerDay} runs per 24 hours reached.`
              : null
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Hit rate" value={`${summary.hitRatePct.toFixed(1)}%`} subtitle={`${summary.wins} of ${summary.totalDecided}`} />
        <StatTile label="ROI" value={`${totalRoiPct >= 0 ? '+' : ''}${totalRoiPct.toFixed(1)}%`} tone={totalRoiPct >= 0 ? 'green' : 'red'} />
        <StatTile label="Avg CLV" value={`${avgClvPct >= 0 ? '+' : ''}${avgClvPct.toFixed(1)}%`} tone={avgClvPct >= 0 ? 'green' : 'red'} />
        <StatTile label="Active picks" value={String(activePicksCount ?? 0)} />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">
          {latestRun ? 'Latest run picks' : 'Picks'}
        </h2>
        <PicksTable picks={picks} />
      </div>

      {noPickRows.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">No-pick log</h2>
          <NoPickLog rows={noPickRows} />
        </div>
      ) : null}
    </AppShell>
  );
}
