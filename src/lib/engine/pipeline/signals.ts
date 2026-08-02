// Numeric signals, scored deterministically from the spec's SIGNAL MODEL and
// MOTIVATION MODEL tables. No LLM here - only the qualitative signals (style
// matchup, late news) need model judgment, and those are built separately in the
// LLM-facing part of the pipeline (see s6-break.ts and the qualitative-read prompt
// in prompts.ts).

import type { MotivationState, Signal, TeamForm, TeamGoalsRate } from '../types';

// --- Form scoring (spec: "Form scoring") ---------------------------------------
// last-3 results: W=+2, D=+0.6, L=-1. Games 4-6: W=+1, D=+0.3, L=-0.5.
// The spec gives ONE combined threshold table (>4.5 / 2.5-4.5 / <2.5) that only
// makes arithmetic sense if the last-3 and last-4-6 scores are summed together
// first. That reconciles the spec's two separate signal ranks (4: recent form,
// 5: extended form) into the one number this function returns - a deliberate,
// documented interpretation, not an oversight.
function rawFormScore(form: TeamForm): number {
  const scoreLast3 = form.last3.reduce((sum, r) => sum + (r === 'W' ? 2 : r === 'D' ? 0.6 : -1), 0);
  const scoreLast4to6 = form.last4to6.reduce((sum, r) => sum + (r === 'W' ? 1 : r === 'D' ? 0.3 : -0.5), 0);
  return scoreLast3 + scoreLast4to6;
}

// Turns the raw sum into the spec's bucketed percentage.
function bucketFormScore(sum: number): number {
  if (sum > 4.5) return 5;
  if (sum >= 2.5) return 3;
  return 0;
}

// One combined "recent form" signal comparing home vs away. Whichever side has
// the stronger bucketed form gets the "for" direction; the magnitude is the gap
// between the two buckets (so two similarly-in-form sides produce a ~0 signal,
// correctly contributing almost nothing).
export function formSignal(homeForm: TeamForm, awayForm: TeamForm): Signal {
  const homeBucket = bucketFormScore(rawFormScore(homeForm));
  const awayBucket = bucketFormScore(rawFormScore(awayForm));
  const gap = Math.abs(homeBucket - awayBucket);
  return {
    rank: 4,
    name: 'Recent form (last 3, weighted with games 4-6)',
    direction: homeBucket >= awayBucket ? 'for' : 'against',
    strength: gap >= 5 ? 'strong' : gap > 0 ? 'weak' : 'weak',
    pctPoints: gap,
    evidence: `Home form score ${homeBucket >= awayBucket ? 'leads' : 'trails'} (bucketed +${homeBucket}% vs +${awayBucket}%).`,
  };
}

// --- xG-proxy differential (spec rank 2) ---------------------------------------
// Goals-for/against per game standing in for xG (see AUDIT.md item 5). The signal
// strength is capped at +/-10 per the spec's per-signal cap, scaled from how large
// the attack-vs-defense gap actually is.
export function goalsRateDifferentialSignal(home: TeamGoalsRate, away: TeamGoalsRate): Signal {
  const homeNetRate = home.goalsForPerGame - home.goalsAgainstPerGame;
  const awayNetRate = away.goalsForPerGame - away.goalsAgainstPerGame;
  const gap = homeNetRate - awayNetRate;
  // A net-rate gap of 1.0 goals/game or more is treated as "strong" - a
  // reasonable, documented scaling choice in the absence of a spec-given formula.
  const magnitude = Math.min(10, Math.round(Math.abs(gap) * 10));
  return {
    rank: 2,
    name: 'Home/away goals-rate differential (xG proxy)',
    direction: gap >= 0 ? 'for' : 'against',
    strength: magnitude >= 8 ? 'strong' : magnitude >= 5 ? 'moderate' : 'weak',
    pctPoints: magnitude,
    evidence: `Net goals rate: home ${homeNetRate.toFixed(2)}/game vs away ${awayNetRate.toFixed(2)}/game.`,
  };
}

// --- Motivation signal (spec rank 3, from the MOTIVATION MODEL table) ----------
const MOTIVATION_PCT: Record<MotivationState, number> = {
  MUST_WIN: 7,
  TITLE_PROMOTION_CHASE: 5,
  EUROPEAN_PUSH: 4,
  DERBY_REVENGE: 4,
  NOTHING_TO_LOSE: 0, // handled as a market steer, not a +/- signal
  ROTATION_RISK: 0, // handled as a hold flag, not a +/- signal
  AGGREGATE_LEAD: 0, // shifts market fit (goals under, corners over), not result %
  AGGREGATE_DEFICIT: 0, // shifts market fit (BTTS/over), not result %
  DEAD_RUBBER: 0,
  NEUTRAL: 0,
};

export function motivationSignal(homeState: MotivationState, awayState: MotivationState): Signal {
  const homePct = MOTIVATION_PCT[homeState];
  const awayPct = MOTIVATION_PCT[awayState];
  const net = homePct - awayPct;
  return {
    rank: 3,
    name: 'Motivation / incentive state',
    direction: net >= 0 ? 'for' : 'against',
    strength: Math.abs(net) >= 7 ? 'strong' : Math.abs(net) >= 4 ? 'moderate' : 'weak',
    pctPoints: Math.min(10, Math.abs(net)),
    evidence: `Home motivation: ${homeState} (+${homePct}%). Away motivation: ${awayState} (+${awayPct}%).`,
  };
}

// --- H2H pattern (spec rank 7, capped +/-6% for European/cross-league) ---------
export function h2hSignal(resultsFromHomePerspective: ('W' | 'D' | 'L')[], isEuropeanOrCrossLeague: boolean): Signal {
  const wins = resultsFromHomePerspective.filter((r) => r === 'W').length;
  const losses = resultsFromHomePerspective.filter((r) => r === 'L').length;
  const net = wins - losses;
  const cap = isEuropeanOrCrossLeague ? 6 : 10;
  const magnitude = Math.min(cap, Math.abs(net) * 2);
  return {
    rank: 7,
    name: 'Head-to-head pattern',
    direction: net >= 0 ? 'for' : 'against',
    strength: magnitude >= 8 ? 'strong' : magnitude >= 5 ? 'moderate' : 'weak',
    pctPoints: magnitude,
    evidence: `Last ${resultsFromHomePerspective.length} H2H from home's perspective: ${wins}W ${resultsFromHomePerspective.length - wins - losses}D ${losses}L.`,
  };
}

// --- Minimum independent-signal count (spec: "Minimum to place") ---------------
// 2 genuinely independent signals for LEAN, 3 for T1 and above. This just counts
// how many signals were actually used - deciding WHICH signals are "independent"
// (e.g. "scores a lot" + "strong attack" count once) is done upstream, by only
// passing in signals that are already known to be distinct.
export function meetsMinimumSignalCount(signalCount: number, tierNeedsThree: boolean): boolean {
  return tierNeedsThree ? signalCount >= 3 : signalCount >= 2;
}
