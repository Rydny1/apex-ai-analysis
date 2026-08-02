// Shared read-side math for global_track_record - the one public, shared
// ledger of every real (admin-triggered) settled pick. Used by the homepage,
// the run page's guest stat row, and the tracking page, so the numbers are
// computed identically everywhere they appear.
export interface TrackRecordRow {
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

export interface TrackRecordSummary {
  totalPicks: number;
  wins: number;
  losses: number;
  hitRatePct: number;
  roiPct: number;
  avgClvPct: number;
  positiveClvRatePct: number;
  cumulativeUnits: number;
}

function unitsPl(row: TrackRecordRow): number {
  return ((row.roiPct ?? 0) * row.stakePct) / 100;
}

export function summarizeTrackRecord(rows: TrackRecordRow[]): TrackRecordSummary {
  const decided = rows.filter((r) => r.result === 'win' || r.result === 'loss');
  const wins = decided.filter((r) => r.result === 'win').length;
  const losses = decided.filter((r) => r.result === 'loss').length;
  const withClv = rows.filter((r) => r.clvPct !== null);
  const positiveClv = withClv.filter((r) => (r.clvPct as number) > 0).length;
  const cumulativeUnits = rows.reduce((sum, r) => sum + unitsPl(r), 0);
  // ROI on total action, not a sum of individual trade percentages - the
  // latter blows up to nonsense figures (800%+) the moment there's more than
  // a handful of picks, since it never accounts for stake size. Profit over
  // total staked is the number a real book actually reports.
  const totalStaked = rows.reduce((sum, r) => sum + r.stakePct, 0);
  const roiPct = totalStaked > 0 ? (cumulativeUnits / totalStaked) * 100 : 0;

  return {
    totalPicks: rows.length,
    wins,
    losses,
    hitRatePct: decided.length > 0 ? (wins / decided.length) * 100 : 0,
    roiPct,
    avgClvPct: withClv.length > 0 ? withClv.reduce((sum, r) => sum + (r.clvPct ?? 0), 0) / withClv.length : 0,
    positiveClvRatePct: withClv.length > 0 ? (positiveClv / withClv.length) * 100 : 0,
    cumulativeUnits,
  };
}

export interface TrackRecordPoint {
  date: string;
  cumulativeUnits: number;
}

// Chronological running total, one point per settled pick - what the
// homepage/tracking area chart plots.
export function buildCumulativeSeries(rows: TrackRecordRow[]): TrackRecordPoint[] {
  const sorted = [...rows].sort((a, b) => new Date(a.settledAt).getTime() - new Date(b.settledAt).getTime());
  let running = 0;
  return sorted.map((row) => {
    running += unitsPl(row);
    return { date: row.settledAt, cumulativeUnits: Math.round(running * 100) / 100 };
  });
}
