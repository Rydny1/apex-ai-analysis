'use client';

// The settlement ledger at the bottom of the tracking page. Client-side sort
// on click (small dataset, no need for a server round-trip) and row hover.
import { useMemo, useState } from 'react';
import { TierBadge } from './TierBadge';

export interface LedgerRow {
  id: string;
  settledAt: string;
  competition: string;
  matchLabel: string;
  market: string;
  tier: string;
  result: 'win' | 'loss' | 'push' | 'void';
  roiPct: number | null;
  clvPct: number | null;
  stakePct: number;
}

type SortKey = 'settledAt' | 'roiPct' | 'clvPct' | 'unitsPl';

const PAGE_SIZE = 20;

function unitsPl(row: LedgerRow): number {
  return ((row.roiPct ?? 0) * row.stakePct) / 100;
}

export function TrackingLedger({ rows }: { rows: LedgerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('settledAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'settledAt') return dir * (new Date(a.settledAt).getTime() - new Date(b.settledAt).getTime());
      if (sortKey === 'roiPct') return dir * ((a.roiPct ?? 0) - (b.roiPct ?? 0));
      if (sortKey === 'clvPct') return dir * ((a.clvPct ?? 0) - (b.clvPct ?? 0));
      return dir * (unitsPl(a) - unitsPl(b));
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-muted">No settled picks yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto border border-hair">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-hair text-ink-muted">
              <SortableTh label="Date" active={sortKey === 'settledAt'} dir={sortDir} onClick={() => handleSort('settledAt')} />
              <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Match</th>
              <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Pick</th>
              <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Tier</th>
              <SortableTh label="ROI" align="right" active={sortKey === 'roiPct'} dir={sortDir} onClick={() => handleSort('roiPct')} />
              <SortableTh label="CLV" align="right" active={sortKey === 'clvPct'} dir={sortDir} onClick={() => handleSort('clvPct')} />
              <th className="px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide">Result</th>
              <SortableTh label="P/L" align="right" active={sortKey === 'unitsPl'} dir={sortDir} onClick={() => handleSort('unitsPl')} />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const pl = unitsPl(row);
              return (
                <tr key={row.id} className="border-b border-hair last:border-0 transition-colors hover:bg-inset">
                  <td className="tabular font-mono px-3 py-2.5 text-ink-muted">{new Date(row.settledAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2.5 text-ink">
                    {row.matchLabel}
                    <div className="text-[11px] text-ink-muted">{row.competition}</div>
                  </td>
                  <td className="px-3 py-2.5 text-ink">{row.market}</td>
                  <td className="px-3 py-2.5">
                    <TierBadge tier={row.tier} />
                  </td>
                  <td className={`tabular font-mono px-3 py-2.5 text-right ${(row.roiPct ?? 0) >= 0 ? 'text-accent' : 'text-loss'}`}>
                    {row.roiPct !== null ? `${row.roiPct >= 0 ? '+' : ''}${row.roiPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className={`tabular font-mono px-3 py-2.5 text-right ${(row.clvPct ?? 0) >= 0 ? 'text-accent' : 'text-loss'}`}>
                    {row.clvPct !== null ? `${row.clvPct >= 0 ? '+' : ''}${row.clvPct.toFixed(1)}%` : 'pending'}
                  </td>
                  <td className={`px-3 py-2.5 font-medium ${row.result === 'win' ? 'text-accent' : row.result === 'loss' ? 'text-loss' : 'text-ink-muted'}`}>
                    {row.result === 'win' ? 'W' : row.result === 'loss' ? 'L' : row.result}
                  </td>
                  <td className={`tabular font-mono px-3 py-2.5 text-right ${pl >= 0 ? 'text-accent' : 'text-loss'}`}>
                    {pl >= 0 ? '+' : ''}
                    {pl.toFixed(2)}u
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
            {page > 1 ? (
              <button type="button" onClick={() => setPage((p) => p - 1)} className="text-accent hover:brightness-110">
                Previous
              </button>
            ) : null}
            {page < totalPages ? (
              <button type="button" onClick={() => setPage((p) => p + 1)} className="text-accent hover:brightness-110">
                Next
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function SortableTh({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  align?: 'right';
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <th className={`px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={onClick} className={`inline-flex items-center gap-1 hover:text-ink-secondary ${active ? 'text-ink-secondary' : ''}`}>
        {label}
        {active ? <span aria-hidden="true">{dir === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </th>
  );
}
