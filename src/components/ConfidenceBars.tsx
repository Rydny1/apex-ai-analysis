// Three thin bars instead of one blended confidence number - the spec's
// decomposition (model/data/lineup) matters because a pick can be high-conviction
// on thin data, and that has to stay visible rather than averaged away. Colored
// by strength, not by which of the three it is - green/amber/red reads at a
// glance the same way every other semantic color does in this app.
function strengthColor(pct: number): string {
  if (pct > 75) return 'bg-accent';
  if (pct >= 50) return 'bg-warning';
  return 'bg-loss';
}

export function ConfidenceBars({ model, data, lineup }: { model: number; data: number; lineup: number }) {
  const values = [
    { label: 'Model', pct: model },
    { label: 'Data', pct: data },
    { label: 'Lineup', pct: lineup },
  ];

  return (
    <div
      className="flex items-center gap-1"
      title={`Model ${model.toFixed(0)}% / Data ${data.toFixed(0)}% / Lineup ${lineup.toFixed(0)}%`}
    >
      {values.map((v) => (
        <span key={v.label} className="h-1 w-5 overflow-hidden rounded-full bg-hair" title={`${v.label} ${v.pct.toFixed(0)}%`}>
          <span
            className={`block h-full rounded-full ${strengthColor(v.pct)} transition-[width] duration-500 ease-out`}
            style={{ width: `${Math.max(0, Math.min(100, v.pct))}%` }}
          />
        </span>
      ))}
    </div>
  );
}
