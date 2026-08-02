import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { StatTile } from '@/components/StatTile';
import { TierBadge } from '@/components/TierBadge';
import { createClient } from '@/lib/supabase/server';
import { computeRoiPct, summarizeSettlements, type SettlementResult } from '@/lib/engine/settlement';

const TIER_TARGETS: Record<string, number> = { T0: 86.5, T1: 79.5, T2: 71, LEAN: 63 };
const TIER_ORDER = ['T0', 'T1', 'T2', 'LEAN'] as const;
const PAGE_SIZE = 20;

// The model performance dashboard - the spec's calibration checks made visible.
// An alert bar surfaces the exact trigger from the spec ("every 20 picks, if hit
// rate deviates >10% from target, adjust weights") rather than hiding it in a log.
export default async function TrackingPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  const supabase = await createClient();

  const { data: settlementRows } = await supabase
    .from('settlements')
    .select('id, result, roi_pct, clv_pct, closing_odds, settled_at, picks(id, market, line, tier, entry_odds, stake_pct, matches(home_team, away_team))')
    .order('settled_at', { ascending: false });

  const rows = (settlementRows ?? []).map((r) => ({
    ...r,
    pick: r.picks as unknown as {
      market: string;
      line: string | null;
      tier: string;
      entry_odds: number | null;
      stake_pct: number;
      matches: { home_team: string; away_team: string } | null;
    } | null,
  }));

  const summary = summarizeSettlements(rows.map((r) => ({ result: r.result as SettlementResult, clvPct: r.clv_pct })));
  const totalUnitsPL = rows.reduce((sum, r) => sum + ((r.roi_pct ?? 0) * (r.pick?.stake_pct ?? 0)) / 100, 0);
  const clvRows = rows.filter((r) => r.clv_pct !== null);
  const avgClvPct = clvRows.length > 0 ? clvRows.reduce((s, r) => s + (r.clv_pct ?? 0), 0) / clvRows.length : 0;
  const totalStakedRoiPct = rows.reduce((sum, r) => sum + (r.roi_pct ?? 0), 0);

  const tierBreakdown = TIER_ORDER.map((tier) => {
    const tierRows = rows.filter((r) => r.pick?.tier === tier);
    const decided = tierRows.filter((r) => r.result === 'win' || r.result === 'loss');
    const wins = decided.filter((r) => r.result === 'win').length;
    const unitsPL = tierRows.reduce((sum, r) => sum + ((r.roi_pct ?? 0) * (r.pick?.stake_pct ?? 0)) / 100, 0);
    const hitRatePct = decided.length > 0 ? (wins / decided.length) * 100 : 0;
    return { tier, wins, decided: decided.length, unitsPL, hitRatePct, target: TIER_TARGETS[tier] };
  });

  const alerts = tierBreakdown.filter((t) => t.decided >= 20 && Math.abs(t.hitRatePct - t.target) > 10);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { data: runsThisMonth } = await supabase.from('runs').select('cost_usd').gte('started_at', monthStart.toISOString());
  const monthCostUsd = (runsThisMonth ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);

  return (
    <AppShell>
      <h1 className="text-[15px] font-medium text-ink">Tracking</h1>

      {alerts.length > 0 ? (
        <div className="mt-4 space-y-2">
          {alerts.map((a) => (
            <div key={a.tier} className="rounded border border-amber/30 bg-amber-tint px-4 py-2.5 text-[13px] text-amber">
              {a.tier} hit rate {a.hitRatePct.toFixed(1)}% deviates {Math.abs(a.hitRatePct - a.target).toFixed(1)} points from its{' '}
              {a.target}% target over {a.decided} decided picks - review signal weights.
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Total picks" value={`${summary.wins}-${summary.losses}`} subtitle={`${rows.length} settled`} />
        <StatTile label="Hit rate" value={`${summary.hitRatePct.toFixed(1)}%`} />
        <StatTile
          label="ROI (staked)"
          value={`${totalStakedRoiPct >= 0 ? '+' : ''}${totalStakedRoiPct.toFixed(1)}%`}
          tone={totalStakedRoiPct >= 0 ? 'green' : 'red'}
        />
        <StatTile label="Avg CLV" value={`${avgClvPct >= 0 ? '+' : ''}${avgClvPct.toFixed(1)}%`} tone={avgClvPct >= 0 ? 'green' : 'red'} />
        <StatTile
          label="Bankroll"
          value={`${totalUnitsPL >= 0 ? '+' : ''}${totalUnitsPL.toFixed(1)}u`}
          tone={totalUnitsPL >= 0 ? 'green' : 'red'}
          subtitle="since start"
        />
      </div>

      <h2 className="mb-3 mt-10 text-[11px] uppercase tracking-wide text-ink-muted">Tier breakdown</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tierBreakdown.map((t) => (
          <div key={t.tier} className="bg-surface-1 p-4">
            <TierBadge tier={t.tier} />
            <div
              className={`tabular mt-3 text-[22px] font-medium ${
                t.decided === 0 ? 'text-ink-muted' : t.hitRatePct >= t.target ? 'text-green' : t.hitRatePct >= t.target - 10 ? 'text-amber' : 'text-red'
              }`}
            >
              {t.decided === 0 ? '—' : `${t.hitRatePct.toFixed(1)}%`}
            </div>
            <div className="mt-1 text-[11px] text-ink-muted">
              {t.wins} of {t.decided} · {t.unitsPL >= 0 ? '+' : ''}
              {t.unitsPL.toFixed(1)}u
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full ${t.hitRatePct >= t.target ? 'bg-green' : t.hitRatePct >= t.target - 10 ? 'bg-amber' : 'bg-red'}`}
                style={{ width: `${Math.max(0, Math.min(100, t.hitRatePct))}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-[11px] uppercase tracking-wide text-ink-muted">Settlement ledger</h2>
      {pageRows.length === 0 ? (
        <p className="text-[13px] text-ink-muted">No settled picks yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md border border-line" style={{ borderWidth: '0.5px' }}>
            <table className="w-full min-w-[860px] text-left text-[13px]">
              <thead>
                <tr className="border-b border-line text-ink-muted" style={{ borderBottomWidth: '0.5px' }}>
                  <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Match</th>
                  <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Pick</th>
                  <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Tier</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-normal uppercase tracking-wide">Entry</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-normal uppercase tracking-wide">Closing</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-normal uppercase tracking-wide">CLV</th>
                  <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Result</th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-normal uppercase tracking-wide">P/L</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const unitsPL = ((row.roi_pct ?? 0) * (row.pick?.stake_pct ?? 0)) / 100;
                  return (
                    <tr key={row.id} className="border-b border-line last:border-0" style={{ borderBottomWidth: '0.5px' }}>
                      <td className="tabular px-3 py-2.5 text-ink-muted">
                        {row.settled_at ? new Date(row.settled_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        {row.pick?.matches ? `${row.pick.matches.home_team} vs ${row.pick.matches.away_team}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-ink">
                        {row.pick?.market}
                        {row.pick?.line ? ` ${row.pick.line}` : ''}
                      </td>
                      <td className="px-3 py-2.5">{row.pick?.tier ? <TierBadge tier={row.pick.tier} /> : null}</td>
                      <td className="tabular px-3 py-2.5 text-right text-ink">
                        {row.pick?.entry_odds !== null && row.pick?.entry_odds !== undefined ? Number(row.pick.entry_odds).toFixed(2) : '—'}
                      </td>
                      <td className="tabular px-3 py-2.5 text-right text-ink-muted">
                        {row.closing_odds !== null ? Number(row.closing_odds).toFixed(2) : 'pending'}
                      </td>
                      <td className={`tabular px-3 py-2.5 text-right ${(row.clv_pct ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                        {row.clv_pct !== null ? `${row.clv_pct >= 0 ? '+' : ''}${Number(row.clv_pct).toFixed(1)}%` : 'pending'}
                      </td>
                      <td className={`px-3 py-2.5 font-medium ${row.result === 'win' ? 'text-green' : row.result === 'loss' ? 'text-red' : 'text-ink-muted'}`}>
                        {row.result === 'win' ? 'W' : row.result === 'loss' ? 'L' : row.result}
                      </td>
                      <td className={`tabular px-3 py-2.5 text-right ${unitsPL >= 0 ? 'text-green' : 'text-red'}`}>
                        {unitsPL >= 0 ? '+' : ''}
                        {unitsPL.toFixed(2)}u
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between text-[13px] text-ink-muted">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-3">
                {page > 1 ? <Link href={`/tracking?page=${page - 1}`} className="text-blue hover:brightness-110">Previous</Link> : null}
                {page < totalPages ? <Link href={`/tracking?page=${page + 1}`} className="text-blue hover:brightness-110">Next</Link> : null}
              </div>
            </div>
          ) : null}
        </>
      )}

      <p className="mt-8 text-[11px] text-ink-muted">
        Positive CLV on {summary.positiveClvRatePct.toFixed(1)}% of settled picks (target: 55%+ over 20+ picks) · ${monthCostUsd.toFixed(2)}{' '}
        spent this month
      </p>
    </AppShell>
  );
}
