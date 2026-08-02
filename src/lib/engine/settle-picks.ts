// Server-only settlement logic, called by the daily cron route. Fetches the final
// score for any placed pick whose match has finished but has no settlement row
// yet, determines W/L, and computes ROI. CLV (needs a closing-odds snapshot near
// kickoff) is deliberately shipped as a smaller follow-up per the build brief -
// this file ships W/L + ROI first, which is the part that doesn't depend on a
// second data pull timed around kickoff.
import 'server-only';
import { createAdminClient } from '../supabase/admin';
import { computeRoiPct, type SettlementResult } from './settlement';

// Only O/U goals settlement is implemented, since that's the only market run.ts
// currently prices (see the "v1 always prices Over/Under 2.5 goals" note in
// run.ts). Extending this to other markets is straightforward once run.ts prices
// them - each market just needs its own "did the line hit" check like this one.
function settleOverUnderGoals(line: string, homeGoals: number, awayGoals: number): SettlementResult {
  const totalGoals = homeGoals + awayGoals;
  const lineValue = parseFloat(line);
  if (Math.abs(totalGoals - lineValue) < 0.001) return 'push'; // exact-line ties only possible on whole-number lines, kept for completeness
  return totalGoals > lineValue ? 'win' : 'loss';
}

export async function settleFinishedPicks(): Promise<{ settled: number; skipped: number }> {
  const supabase = createAdminClient();

  // Picks that are placed bets, have no settlement yet, and whose match kicked
  // off more than 2.5 hours ago (comfortably past full time + stoppage).
  const cutoff = new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString();

  const { data: candidatePicks } = await supabase
    .from('picks')
    .select('id, market, line, tier, entry_odds, stake_pct, match_id, matches!inner(external_fixture_id, kickoff, competition, home_team, away_team)')
    .eq('is_pick', true)
    .lte('matches.kickoff', cutoff);

  if (!candidatePicks) return { settled: 0, skipped: 0 };

  let settled = 0;
  let skipped = 0;

  for (const pick of candidatePicks) {
    const { data: existingSettlement } = await supabase.from('settlements').select('id').eq('pick_id', pick.id).maybeSingle();
    if (existingSettlement) {
      skipped += 1;
      continue;
    }

    if (pick.market !== 'O/U' || !pick.line) {
      skipped += 1; // this build only knows how to settle O/U goals - see the note above
      continue;
    }

    const match = (pick as unknown as { matches: { external_fixture_id: string; competition: string; home_team: string; away_team: string } }).matches;
    const finalScore = await fetchFinalScore(match.external_fixture_id);
    if (!finalScore) {
      skipped += 1; // match not actually finished yet, or the API had no data - try again next cron run
      continue;
    }

    const result = settleOverUnderGoals(pick.line, finalScore.home, finalScore.away);
    const roiPct = pick.entry_odds ? computeRoiPct(result, pick.entry_odds, 100) : 0; // percentage return on a full ("100%") stake, before scaling by the pick's actual stake_pct
    const settledAt = new Date().toISOString();

    await supabase.from('settlements').insert({
      pick_id: pick.id,
      result,
      settled_at: settledAt,
      roi_pct: roiPct,
    });

    // Every real settled pick also lands in the one public, shared track
    // record - the homepage and /tracking read only from here, never from
    // the per-owner settlements table, so this is what actually keeps the
    // portfolio's "live" numbers live. See lib/track-record.ts.
    await supabase.from('global_track_record').insert({
      settled_at: settledAt,
      competition: match.competition,
      match_label: `${match.home_team} vs ${match.away_team}`,
      market: pick.line ? `${pick.market} ${pick.line}` : pick.market,
      tier: pick.tier,
      result,
      roi_pct: roiPct,
      clv_pct: null, // CLV needs a closing-odds snapshot near kickoff - a follow-up, see settlements table's own note
      stake_pct: pick.stake_pct,
    });

    settled += 1;
  }

  return { settled, skipped };
}

async function fetchFinalScore(fixtureId: string): Promise<{ home: number; away: number } | null> {
  const { config } = await import('../config');
  const response = await fetch(`${config.apiFootball.baseUrl}/fixtures?id=${fixtureId}`, {
    headers: { 'x-rapidapi-key': config.apiFootball.apiKey, 'x-rapidapi-host': config.apiFootball.host },
  });
  if (!response.ok) return null;

  const json = (await response.json()) as { response: { fixture: { status: { short: string } }; goals: { home: number | null; away: number | null } }[] };
  const fixture = json.response[0];
  if (!fixture || fixture.fixture.status.short !== 'FT' || fixture.goals.home === null || fixture.goals.away === null) return null;

  return { home: fixture.goals.home, away: fixture.goals.away };
}
