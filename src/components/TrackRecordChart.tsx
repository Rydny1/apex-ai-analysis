'use client';

// The cumulative-units area chart shared by the homepage and the tracking
// page. Single series, single hue (--accent) - this is the one place in the
// app where a chart carries the whole "does this actually work" argument, so
// it stays plain: no second color, no legend needed for one line.
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TrackRecordPoint } from '@/lib/track-record';

export function TrackRecordChart({ points, height = 320 }: { points: TrackRecordPoint[]; height?: number }) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center border border-hair bg-elevated text-[13px] text-ink-muted" style={{ height }}>
        No settled picks yet.
      </div>
    );
  }

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trackRecordFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a8e6a3" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#a8e6a3" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            tick={{ fill: 'rgba(245, 244, 239, 0.4)', fontSize: 11 }}
            axisLine={{ stroke: 'rgba(255, 255, 255, 0.06)' }}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: 'rgba(245, 244, 239, 0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(value: number) => `${value >= 0 ? '+' : ''}${value}u`}
          />
          <Tooltip
            contentStyle={{
              background: '#111112',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 4,
              fontSize: 12,
              color: '#f5f4ef',
            }}
            labelFormatter={(value) => (typeof value === 'string' ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : value)}
            formatter={(value) => [`${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}u`, 'Cumulative']}
          />
          <Area
            type="monotone"
            dataKey="cumulativeUnits"
            stroke="#a8e6a3"
            strokeWidth={2}
            fill="url(#trackRecordFill)"
            isAnimationActive
            animationDuration={800}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
