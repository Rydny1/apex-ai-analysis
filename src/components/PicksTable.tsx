// The centerpiece table, shared by the dashboard (latest run) and the per-run
// results page. Full-width table, not cards - every number in the `.tabular`
// mono column style, tier as a pill, edge colored green when positive, and the
// three-bar confidence decomposition instead of one blended score.
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
      <p className="text-[13px] text-ink-muted">
        No picks cleared the VALUE GATE. An empty slate means the market was efficient, not that the system failed.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-line" style={{ borderWidth: '0.5px' }}>
      <table className="w-full min-w-[880px] text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-ink-muted" style={{ borderBottomWidth: '0.5px' }}>
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
            <tr key={pick.id} className="border-b border-line last:border-0" style={{ borderBottomWidth: '0.5px' }}>
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
              <td className="tabular px-3 py-2.5 text-right text-ink">{pick.entryOdds !== null ? pick.entryOdds.toFixed(2) : '—'}</td>
              <td className="tabular px-3 py-2.5 text-right text-ink">{pick.probability.toFixed(1)}%</td>
              <td className={`tabular px-3 py-2.5 text-right font-medium ${(pick.edge ?? 0) >= 0 ? 'text-green' : 'text-red'}`}>
                {pick.edge !== null ? `${pick.edge >= 0 ? '+' : ''}${pick.edge.toFixed(1)}%` : '—'}
              </td>
              <td className="tabular px-3 py-2.5 text-right text-ink">{pick.stakePct.toFixed(1)}%</td>
              <td className="px-3 py-2.5">
                <ConfidenceBars model={pick.modelConfidence} data={pick.dataConfidence} lineup={pick.lineupConfidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return <th className={`px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</th>;
}
