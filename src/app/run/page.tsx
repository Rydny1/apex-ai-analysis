import { AppShell } from '@/components/AppShell';
import { RunBar, type LastRunSummary } from '@/components/RunBar';
import { DemoRunBar } from '@/components/DemoRunBar';
import { StatTile } from '@/components/StatTile';
import { PicksTable, type PickRow } from '@/components/PicksTable';
import { NoPickLog, type NoPickRow } from '@/components/NoPickLog';
import { createClient } from '@/lib/supabase/server';
import { config } from '@/lib/config';
import { getRole } from '@/lib/auth-role';
import { summarizeSettlements, type SettlementResult } from '@/lib/engine/settlement';
import { summarizeTrackRecord, type TrackRecordRow } from '@/lib/track-record';

// The dashboard - three zones stacked vertically: the run bar (trigger + live
// progress for admin, a demo preview modal for everyone else), the stats row,
// and the picks table for the most recent run. Guests see the same shape
// populated with the shared demo run rather than an empty state - see the
// v2 redesign brief's "guest mode, not guest runs."
export default async function RunPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = await getRole(supabase, user);

  if (role === 'admin') return <AdminRunView />;
  return <GuestRunView />;
}

async function AdminRunView() {
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

  const { data: settlements } = await supabase.from('settlements').select('result, roi_pct, clv_pct, picks!inner(stake_pct)');
  const summary = summarizeSettlements((settlements ?? []).map((s) => ({ result: s.result as SettlementResult, clvPct: s.clv_pct })));
  // ROI on total action (profit / total staked), not a sum of individual
  // trade percentages - the latter blows up past 100% with more than a
  // handful of picks, since it never accounts for stake size.
  const settlementRows = (settlements ?? []) as unknown as { roi_pct: number | null; clv_pct: number | null; picks: { stake_pct: number } }[];
  const totalUnitsPl = settlementRows.reduce((sum, s) => sum + ((s.roi_pct ?? 0) * s.picks.stake_pct) / 100, 0);
  const totalStaked = settlementRows.reduce((sum, s) => sum + s.picks.stake_pct, 0);
  const totalRoiPct = totalStaked > 0 ? (totalUnitsPl / totalStaked) * 100 : 0;
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
        <StatTile label="Hit rate" value={`${summary.hitRatePct.toFixed(1)}%`} subtitle={`${summary.wins} of ${summary.totalDecided}`} progressPct={summary.hitRatePct} />
        <StatTile label="ROI" value={`${totalRoiPct >= 0 ? '+' : ''}${totalRoiPct.toFixed(1)}%`} tone={totalRoiPct >= 0 ? 'accent' : 'loss'} />
        <StatTile label="Avg CLV" value={`${avgClvPct >= 0 ? '+' : ''}${avgClvPct.toFixed(1)}%`} tone={avgClvPct >= 0 ? 'accent' : 'loss'} />
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

async function GuestRunView() {
  const supabase = await createClient();

  const { data: demoRun } = await supabase.from('demo_run').select('*').limit(1).maybeSingle();
  const { data: demoMatches } = await supabase.from('demo_match').select('*');
  const { data: demoPicks } = await supabase.from('demo_pick').select('*');
  const { data: trackRecordRows } = await supabase.from('global_track_record').select('*');

  const summary = summarizeTrackRecord(
    (trackRecordRows ?? []).map(
      (r): TrackRecordRow => ({
        id: r.id,
        settledAt: r.settled_at,
        competition: r.competition,
        matchLabel: r.match_label,
        market: r.market,
        tier: r.tier,
        result: r.result as TrackRecordRow['result'],
        roiPct: r.roi_pct !== null ? Number(r.roi_pct) : null,
        clvPct: r.clv_pct !== null ? Number(r.clv_pct) : null,
        stakePct: Number(r.stake_pct),
      }),
    ),
  );

  const matchById = new Map((demoMatches ?? []).map((m) => [m.id, m]));
  const placedPicks = (demoPicks ?? []).filter((p) => p.is_pick);
  const rejectedPicks = (demoPicks ?? []).filter((p) => !p.is_pick);
  const droppedMatches = (demoMatches ?? []).filter((m) => m.stage === 'dropped');

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

  const sampleRunLabel = demoRun
    ? `Sample run · ${new Date(demoRun.started_at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${demoRun.scanned_count} scanned · ${demoRun.entered_count} analyzed · ${picks.length} picks`
    : 'Sample run';

  return (
    <AppShell>
      <DemoRunBar sampleRunLabel={sampleRunLabel} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Hit rate" value={`${summary.hitRatePct.toFixed(1)}%`} subtitle={`${summary.wins} of ${summary.wins + summary.losses} · live`} progressPct={summary.hitRatePct} />
        <StatTile label="ROI" value={`${summary.roiPct >= 0 ? '+' : ''}${summary.roiPct.toFixed(1)}%`} tone={summary.roiPct >= 0 ? 'accent' : 'loss'} subtitle="live" />
        <StatTile label="Avg CLV" value={`${summary.avgClvPct >= 0 ? '+' : ''}${summary.avgClvPct.toFixed(1)}%`} tone={summary.avgClvPct >= 0 ? 'accent' : 'loss'} subtitle="live" />
        <StatTile label="Sample picks" value={String(picks.length)} subtitle="this run" />
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">Sample run picks</h2>
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
