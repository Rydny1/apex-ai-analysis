import { AppShell } from '@/components/AppShell';
import { StatTile } from '@/components/StatTile';
import { TierBadge } from '@/components/TierBadge';
import { TrackRecordChart } from '@/components/TrackRecordChart';
import { TrackingLedger } from '@/components/TrackingLedger';
import { Reveal } from '@/components/Reveal';
import { createClient } from '@/lib/supabase/server';
import { buildCumulativeSeries, summarizeTrackRecord, type TrackRecordRow } from '@/lib/track-record';

const TIER_TARGETS: Record<string, number> = { T0: 86.5, T1: 79.5, T2: 71, LEAN: 63 };
const TIER_ORDER = ['T0', 'T1', 'T2', 'LEAN'] as const;

// The model performance dashboard - the one public, shared track record.
// Every account reads the same rows from global_track_record (see the v2
// redesign brief): this page is the portfolio proof, not a per-user log, so
// there's no role branching here at all.
export default async function TrackingPage() {
  const supabase = await createClient();
  const { data: rawRows } = await supabase.from('global_track_record').select('*').order('settled_at', { ascending: false });

  const rows: TrackRecordRow[] = (rawRows ?? []).map((r) => ({
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
  }));

  const summary = summarizeTrackRecord(rows);
  const series = buildCumulativeSeries(rows);

  const tierBreakdown = TIER_ORDER.map((tier) => {
    const tierRows = rows.filter((r) => r.tier === tier);
    const decided = tierRows.filter((r) => r.result === 'win' || r.result === 'loss');
    const wins = decided.filter((r) => r.result === 'win').length;
    const unitsPL = tierRows.reduce((sum, r) => sum + ((r.roiPct ?? 0) * r.stakePct) / 100, 0);
    const hitRatePct = decided.length > 0 ? (wins / decided.length) * 100 : 0;
    return { tier, wins, decided: decided.length, unitsPL, hitRatePct, target: TIER_TARGETS[tier] };
  });

  const alerts = tierBreakdown.filter((t) => t.decided >= 20 && Math.abs(t.hitRatePct - t.target) > 10);

  return (
    <AppShell>
      <h1 className="font-serif text-[28px] text-ink">
        The <span className="italic text-accent">track record</span>
      </h1>
      <p className="mt-2 max-w-xl text-[13px] text-ink-secondary">
        Every real pick, settled against the actual result. Shared across every account - this is the one number
        that matters, and no account sees a different version of it.
      </p>

      {alerts.length > 0 ? (
        <div className="mt-6 space-y-2">
          {alerts.map((a) => (
            <div key={a.tier} className="border border-warning/30 bg-warning/10 px-4 py-2.5 text-[13px] text-warning">
              {a.tier} hit rate {a.hitRatePct.toFixed(1)}% deviates {Math.abs(a.hitRatePct - a.target).toFixed(1)} points from its{' '}
              {a.target}% target over {a.decided} decided picks - review signal weights.
            </div>
          ))}
        </div>
      ) : null}

      <Reveal className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5" delay={0.05}>
        <StatTile label="Total picks" value={String(rows.length)} subtitle={`${summary.wins}-${summary.losses}`} />
        <StatTile label="Hit rate" value={`${summary.hitRatePct.toFixed(1)}%`} progressPct={summary.hitRatePct} />
        <StatTile label="ROI (staked)" value={`${summary.roiPct >= 0 ? '+' : ''}${summary.roiPct.toFixed(1)}%`} tone={summary.roiPct >= 0 ? 'accent' : 'loss'} />
        <StatTile label="Avg CLV" value={`${summary.avgClvPct >= 0 ? '+' : ''}${summary.avgClvPct.toFixed(1)}%`} tone={summary.avgClvPct >= 0 ? 'accent' : 'loss'} />
        <StatTile
          label="Bankroll"
          value={`${summary.cumulativeUnits >= 0 ? '+' : ''}${summary.cumulativeUnits.toFixed(1)}u`}
          tone={summary.cumulativeUnits >= 0 ? 'accent' : 'loss'}
          subtitle="since start"
        />
      </Reveal>

      <Reveal className="mt-10" delay={0.1}>
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">Cumulative units</h2>
        <TrackRecordChart points={series} />
      </Reveal>

      <Reveal className="mt-10" delay={0.1}>
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">Tier breakdown</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tierBreakdown.map((t) => (
            <div key={t.tier} className="border border-hair bg-elevated p-4 transition-colors hover:border-strong">
              <TierBadge tier={t.tier} />
              <div
                className={`tabular font-mono mt-3 text-[22px] font-normal ${
                  t.decided === 0 ? 'text-ink-muted' : t.hitRatePct >= t.target ? 'text-accent' : t.hitRatePct >= t.target - 10 ? 'text-warning' : 'text-loss'
                }`}
              >
                {t.decided === 0 ? '—' : `${t.hitRatePct.toFixed(1)}%`}
              </div>
              <div className="mt-1 text-[11px] text-ink-muted">
                {t.wins} of {t.decided} · {t.unitsPL >= 0 ? '+' : ''}
                {t.unitsPL.toFixed(1)}u
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-hair">
                <div
                  className={`h-full rounded-full ${t.hitRatePct >= t.target ? 'bg-accent' : t.hitRatePct >= t.target - 10 ? 'bg-warning' : 'bg-loss'}`}
                  style={{ width: `${Math.max(0, Math.min(100, t.hitRatePct))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      <Reveal className="mt-10" delay={0.1}>
        <h2 className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">Settlement ledger</h2>
        <TrackingLedger rows={rows} />
      </Reveal>

      <p className="mt-8 text-[11px] text-ink-muted">
        Positive CLV on {summary.positiveClvRatePct.toFixed(1)}% of settled picks (target: 55%+ over 20+ picks)
      </p>
    </AppShell>
  );
}
