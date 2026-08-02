// Tier pill: small and quiet, not shouting - 10px uppercase, tinted background
// matched to text color. T0 green (best), T1 blue (the one interactive/primary
// hue, doubling as "solid and reliable" here), T2 amber (caution), LEAN gray
// (muted - it's the thinnest-edge tier). NO-PICK gets no color at all.
const TIER_STYLES: Record<string, string> = {
  T0: 'bg-green-tint text-green',
  T1: 'bg-blue-tint text-blue',
  T2: 'bg-amber-tint text-amber',
  LEAN: 'bg-gray-tint text-gray',
  'NO-PICK': 'text-ink-muted',
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-block rounded text-[10px] font-medium uppercase tracking-wide ${TIER_STYLES[tier] ?? 'text-ink-muted'}`}
      style={{ padding: '2px 8px' }}
    >
      {tier}
    </span>
  );
}
