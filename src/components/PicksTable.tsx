// The centerpiece table, shared by the dashboard (latest run) and the per-run
// results page. Full-width table on desktop - every number in mono, tabular,
// tier as a pill, edge in accent when positive. Below sm, this collapses to a
// stacked card per pick instead of a horizontally-scrolled table: pick title,
// tier and edge as the primary row, odds/prob/confidence secondary.
import { IconCrosshair } from '@tabler/icons-react';
import { TierBadge } from './TierBadge';
import { ConfidenceBars } from './ConfidenceBars';

export interface PickRow {
  id: string;
  matchLabel: string;
  competition: string;
  market: string;
  line: string | null;
  tier: string;
  entryOdds: number | null;
  probability: number;
  edge: number | null;
  stakePct: number;
  modelConfidence: number;
  dataConfidence: number;
  lineupConfidence: number;
}

export function PicksTable({ picks }: { picks: PickRow[] }) {
  if (picks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 border border-hair bg-elevated px-6 py-14 text-center">
        <IconCrosshair size={40} stroke={1.25} className="text-ink-faint" />
        <p className="max-w-sm text-[13px] text-ink-muted">
          No picks cleared the VALUE GATE. An empty slate means the market was efficient, not that the system failed.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto border border-hair sm:block">
        <table className="w-full min-w-[880px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-hair text-ink-muted">
              <Th>Match</Th>
              <Th>Pick</Th>
              <Th>Tier</Th>
              <Th align="right">Odds</Th>
              <Th align="right">Prob</Th>
              <Th align="right">Edge</Th>
              <Th align="right">Stake</Th>
              <Th>Confidence</Th>
            </tr>
          </thead>
          <tbody>
            {picks.map((pick) => (
              <tr key={pick.id} className="border-b border-hair last:border-0 transition-colors hover:bg-inset">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-ink">{pick.matchLabel}</div>
                  <div className="text-[11px] text-ink-muted">{pick.competition}</div>
                </td>
                <td className="px-3 py-2.5 text-ink">
                  {pick.market}
                  {pick.line ? ` ${pick.line}` : ''}
                </td>
                <td className="px-3 py-2.5">
                  <TierBadge tier={pick.tier} />
                </td>
                <td className="tabular font-mono px-3 py-2.5 text-right text-ink">{pick.entryOdds !== null ? pick.entryOdds.toFixed(2) : '—'}</td>
                <td className="tabular font-mono px-3 py-2.5 text-right text-ink">{pick.probability.toFixed(1)}%</td>
                <td className={`tabular font-mono px-3 py-2.5 text-right font-medium ${(pick.edge ?? 0) >= 0 ? 'text-accent' : 'text-loss'}`}>
                  {pick.edge !== null ? `${pick.edge >= 0 ? '+' : ''}${pick.edge.toFixed(1)}%` : '—'}
                </td>
                <td className="tabular font-mono px-3 py-2.5 text-right text-ink">{pick.stakePct.toFixed(1)}%</td>
                <td className="px-3 py-2.5">
                  <ConfidenceBars model={pick.modelConfidence} data={pick.dataConfidence} lineup={pick.lineupConfidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 sm:hidden">
        {picks.map((pick) => (
          <div key={pick.id} className="border border-hair bg-elevated p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-ink">{pick.matchLabel}</div>
                <div className="mt-0.5 text-[11px] text-ink-muted">
                  {pick.competition} · {pick.market}
                  {pick.line ? ` ${pick.line}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <TierBadge tier={pick.tier} />
                <span className={`tabular font-mono text-[13px] font-medium ${(pick.edge ?? 0) >= 0 ? 'text-accent' : 'text-loss'}`}>
                  {pick.edge !== null ? `${pick.edge >= 0 ? '+' : ''}${pick.edge.toFixed(1)}%` : '—'}
                </span>
              </div>
            </div>
            <div className="tabular font-mono mt-3 flex items-center justify-between border-t border-hair pt-3 text-[12px] text-ink-secondary">
              <span>Odds {pick.entryOdds !== null ? pick.entryOdds.toFixed(2) : '—'}</span>
              <span>Prob {pick.probability.toFixed(1)}%</span>
              <span>Stake {pick.stakePct.toFixed(1)}%</span>
            </div>
            <div className="mt-3">
              <ConfidenceBars model={pick.modelConfidence} data={pick.dataConfidence} lineup={pick.lineupConfidence} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <th className={`px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}
