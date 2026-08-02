// The eliminated-matches log: same quiet table style, muted text throughout -
// this is a record, not a result. Collapsed by default once it grows past 5
// rows, using native <details> so the collapse needs no client-side JS at all.
export interface NoPickRow {
  id: string;
  label: string;
  reason: string;
}

export function NoPickLog({ rows }: { rows: NoPickRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-ink-muted">Nothing logged.</p>;
  }

  const table = (
    <div className="divide-y divide-hair border border-hair text-[13px]">
      {rows.map((row) => (
        <div key={row.id} className="flex items-baseline justify-between gap-4 px-3 py-2.5">
          <span className="text-ink-secondary">{row.label}</span>
          <span className="text-right text-ink-muted">{row.reason}</span>
        </div>
      ))}
    </div>
  );

  if (rows.length <= 5) return table;

  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[13px] text-ink-muted hover:text-ink-secondary">
        Show {rows.length} eliminated matches
      </summary>
      <div className="mt-3">{table}</div>
    </details>
  );
}
