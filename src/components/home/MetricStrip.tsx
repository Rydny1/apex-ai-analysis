import { CountUp } from '@/components/CountUp';

// Still inside the fold: four numbers, count-up on first scroll into view.
// 2x2 below 640px, 4x1 above - the redesign brief's mobile principle in its
// simplest form (grid-cols-2 sm:grid-cols-4), not a shrunk desktop layout.
export function MetricStrip({
  hitRatePct,
  roiPct,
  avgClvPct,
  bankrollUnits,
}: {
  hitRatePct: number;
  roiPct: number;
  avgClvPct: number;
  bankrollUnits: number;
}) {
  const metrics = [
    { label: 'Hit rate', value: hitRatePct, decimals: 1, suffix: '%' },
    { label: 'ROI', value: roiPct, decimals: 1, suffix: '%', signed: true },
    { label: 'Avg CLV', value: avgClvPct, decimals: 1, suffix: '%', signed: true },
    { label: 'Bankroll', value: bankrollUnits, decimals: 1, suffix: 'u', signed: true },
  ];

  return (
    <div className="border-y border-hair bg-elevated">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-y divide-hair sm:grid-cols-4 sm:divide-y-0 px-6 sm:px-8">
        {metrics.map((m) => (
          <div key={m.label} className="px-2 py-8 text-center sm:px-6">
            <div className="text-[11px] uppercase tracking-wide text-ink-muted">{m.label}</div>
            <div className="tabular font-mono mt-2 text-[28px] font-normal text-accent">
              <CountUp value={m.value} decimals={m.decimals} prefix={m.signed && m.value >= 0 ? '+' : ''} suffix={m.suffix} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
