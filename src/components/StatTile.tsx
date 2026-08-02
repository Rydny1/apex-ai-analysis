// Zone 2's metric tiles: surface-1 background, no border. Label small and muted
// uppercase, value large mono, optional subtitle smaller and muted below.
export function StatTile({ label, value, subtitle, tone }: { label: string; value: string; subtitle?: string; tone?: 'green' | 'red' | 'ink' }) {
  const valueColor = tone === 'green' ? 'text-green' : tone === 'red' ? 'text-red' : 'text-ink';
  return (
    <div className="bg-surface-1 px-4 py-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`tabular mt-1 text-[22px] font-medium ${valueColor}`}>{value}</div>
      {subtitle ? <div className="mt-1 text-[11px] text-ink-muted">{subtitle}</div> : null}
    </div>
  );
}
