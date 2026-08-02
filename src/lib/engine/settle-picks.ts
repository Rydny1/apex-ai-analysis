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
    .select('id, market, line, entry_odds, match_id, matches!inner(external_fixture_id, kickoff)')
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

    const fixtureId = (pick as unknown as { matches: { external_fixture_id: string } }).matches.external_fixture_id;
    const finalScore = await fetchFinalScore(fixtureId);
    if (!finalScore) {
      skipped += 1; // match not actually finished yet, or the API had no data - try again next cron run
      continue;
    }

    const result = settleOverUnderGoals(pick.line, finalScore.home, finalScore.away);
    const roiPct = pick.entry_odds ? computeRoiPct(result, pick.entry_odds, 1) : 0; // ROI per unit stake; actual stake_pct lives on the pick row for display

    await supabase.from('settlements').insert({
      pick_id: pick.id,
      result,
      settled_at: new Date().toISOString(),
      roi_pct: roiPct,
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
