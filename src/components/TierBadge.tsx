// Tier pill: small and quiet, not shouting - 10px uppercase. Accent is a
// single-hue constraint app-wide, so tiers are told apart by weight, not by
// introducing new hues: T0 gets the full accent fill, T1 an accent outline
// only, T2 the muted amber warning token, LEAN plain muted ink. NO-PICK gets
// no color at all.
const TIER_STYLES: Record<string, string> = {
  T0: 'bg-accent/10 text-accent',
  T1: 'border border-accent/30 text-ink-secondary',
  T2: 'bg-warning/10 text-warning',
  LEAN: 'bg-hair text-ink-muted',
  'NO-PICK': 'text-ink-faint',
};

export function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={`inline-block rounded text-[10px] font-medium uppercase tracking-wide ${TIER_STYLES[tier] ?? 'text-ink-faint'}`}
      style={{ padding: '2px 8px' }}
    >
      {tier}
    </span>
  );
}
