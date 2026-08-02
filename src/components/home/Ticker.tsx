'use client';

// Recent-picks ticker: pure CSS keyframe scroll (see .ticker-track in
// globals.css), pauses on hover. The track holds two back-to-back copies of
// the same list so the loop point is invisible. Slower and with larger touch
// targets on mobile per the redesign brief's mobile section.
import { useState } from 'react';

export interface TickerItem {
  id: string;
  matchLabel: string;
  market: string;
  result: 'win' | 'loss' | 'push' | 'void';
  unitsPl: number;
  date: string;
}

export function Ticker({ items }: { items: TickerItem[] }) {
  const [hovered, setHovered] = useState<string | null>(null);

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div className="overflow-hidden border-b border-hair bg-canvas py-3">
      <div className="ticker-track flex w-max gap-8 [animation-duration:32s] max-sm:[animation-duration:46s]">
        {doubled.map((item, i) => (
          <div
            key={`${item.id}-${i}`}
            className="relative flex min-h-[44px] shrink-0 items-center gap-2 whitespace-nowrap px-2 text-[13px]"
            onMouseEnter={() => setHovered(`${item.id}-${i}`)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="text-ink-secondary">{item.matchLabel}</span>
            <span className="text-ink-muted">{item.market}</span>
            <span className={item.result === 'win' ? 'text-accent' : item.result === 'loss' ? 'text-loss' : 'text-ink-muted'}>
              {item.result === 'win' ? 'W' : item.result === 'loss' ? 'L' : item.result.toUpperCase()}
            </span>
            <span className={`tabular font-mono ${item.unitsPl >= 0 ? 'text-accent' : 'text-loss'}`}>
              {item.unitsPl >= 0 ? '+' : ''}
              {item.unitsPl.toFixed(2)}u
            </span>
            <span className="text-ink-faint">·</span>

            {hovered === `${item.id}-${i}` ? (
              <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded border border-hair bg-elevated px-2.5 py-1.5 text-[11px] text-ink-secondary shadow-lg">
                {item.matchLabel} · {new Date(item.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
