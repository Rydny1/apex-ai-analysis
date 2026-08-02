// A metric tile: quiet uppercase label, loud mono number - the app's visual
// signature. `progressPct` (0-100, optional) draws a thin bar underneath
// showing progress toward whatever threshold the caller defines; omit it for
// tiles where a bar wouldn't mean anything (e.g. a raw count).
export function StatTile({
  label,
  value,
  subtitle,
  tone,
  progressPct,
}: {
  label: string;
  value: string;
  subtitle?: string;
  tone?: 'accent' | 'loss' | 'ink';
  progressPct?: number;
}) {
  const valueColor = tone === 'accent' ? 'text-accent' : tone === 'loss' ? 'text-loss' : 'text-ink';
  return (
    <div className="border border-hair bg-elevated px-4 py-4 transition-colors hover:border-strong">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`tabular mt-1 font-mono text-[28px] font-normal ${valueColor}`}>{value}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-ink-muted">{subtitle}</div> : null}
      {progressPct !== undefined ? (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-hair">
          <div
            className={`h-full rounded-full transition-[width] duration-700 ease-out ${tone === 'loss' ? 'bg-loss' : 'bg-accent'}`}
            style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
