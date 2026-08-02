// POST /api/run - the one button that triggers a full analysis run. Enforces
// both Layer 2 in-app limits from the build brief: max 3 runs per 24h, and
// idempotency (a duplicate click while a run is already in flight does not start
// a second one). Layer 1 (the Anthropic console spend cap) is set outside this
// code, in the Anthropic dashboard - see README.md.
//
// Returns the run id immediately after creating the row, then keeps working via
// Next.js's `after()` - the same serverless invocation stays alive past the
// response (bounded by the same `maxDuration` below), which is what lets the
// run page show live progress without building a queue (explicitly out of scope
// per the build brief).
import { NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { runPipeline } from '@/lib/engine/run';
import { config } from '@/lib/config';
import { getRole } from '@/lib/auth-role';
import type { SupabaseClient } from '@supabase/supabase-js';

export const maxDuration = 300; // 5 minutes - comfortably covers a 12-match shortlist with 2 LLM calls each

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  // Real runs cost real Anthropic spend. Only the admin account can trigger
  // one - every other signed-in account is a guest and only sees demo data
  // (see lib/auth-role.ts). This is enforced here, not just hidden in the UI.
  const role = await getRole(supabase, user);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Live runs are restricted to the admin account. See the demo preview instead.' }, { status: 403 });
  }

  // Idempotency: refuse a new run while one is already in flight for this owner.
  const { data: inFlight } = await supabase.from('runs').select('id').eq('status', 'running').limit(1);
  if (inFlight && inFlight.length > 0) {
    return NextResponse.json({ error: 'A run is already in progress.' }, { status: 409 });
  }

  // Max 3 runs per rolling 24h, counted from the database (not in-memory, so it
  // survives across serverless invocations).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase.from('runs').select('id', { count: 'exact', head: true }).gte('started_at', since);
  if ((count ?? 0) >= config.limits.maxRunsPerDay) {
    return NextResponse.json({ error: `Max ${config.limits.maxRunsPerDay} runs per 24 hours reached.` }, { status: 429 });
  }

  const windowStart = new Date();
  const windowEnd = new Date(windowStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data: run, error: insertError } = await supabase
    .from('runs')
    .insert({
      window_start: windowStart.toISOString().slice(0, 10),
      window_end: windowEnd.toISOString().slice(0, 10),
      status: 'running',
      progress_pct: 0,
      progress_stage: 'Starting',
    })
    .select('id')
    .single();

  if (insertError || !run) {
    return NextResponse.json({ error: 'Could not create the run record.' }, { status: 500 });
  }

  after(() => executeAndPersistRun(supabase, run.id));

  return NextResponse.json({ runId: run.id });
}

async function executeAndPersistRun(supabase: SupabaseClient, runId: string) {
  try {
    const summary = await runPipeline(async (pct, stage) => {
      await supabase.from('runs').update({ progress_pct: pct, progress_stage: stage }).eq('id', runId);
    });

    for (const dropped of summary.droppedLog) {
      await supabase.from('matches').insert({
        run_id: runId,
        external_fixture_id: 'unknown', // droppedLog is a lightweight summary; full fixture ids are on entered/held matches below
        competition: dropped.competition,
        home_team: dropped.teams.split(' vs ')[0] ?? dropped.teams,
        away_team: dropped.teams.split(' vs ')[1] ?? '',
        kickoff: new Date().toISOString(),
        stage: 'dropped',
        drop_reason: dropped.reason,
      });
    }

    for (const pick of summary.picks) {
      const { data: matchRow } = await supabase
        .from('matches')
        .insert({
          run_id: runId,
          external_fixture_id: pick.candidate.fixture.externalId,
          competition: pick.candidate.fixture.competition,
          home_team: pick.candidate.fixture.home.name,
          away_team: pick.candidate.fixture.away.name,
          kickoff: pick.candidate.fixture.kickoff,
          stage: 'entered',
          raw_data: pick.candidate as unknown as object,
        })
        .select('id')
        .single();

      if (!matchRow) continue;

      await supabase.from('picks').insert({
        run_id: runId,
        match_id: matchRow.id,
        market: pick.candidate.market,
        line: pick.candidate.line,
        tier: pick.tier,
        probability: pick.candidate.finalPct,
        implied_probability: pick.impliedPct,
        edge: pick.edgePct,
        entry_odds: pick.freshOdds?.decimalOdds,
        odds_book: pick.freshOdds?.book,
        stake_pct: pick.stakePct,
        model_confidence: pick.confidence.model,
        data_confidence: pick.confidence.data,
        lineup_confidence: pick.confidence.lineup,
        signals: pick.candidate.signals as unknown as object,
        penalties: pick.candidate.penalties as unknown as object,
        is_pick: true,
      });
    }

    for (const noPick of summary.noPicks) {
      const { data: matchRow } = await supabase
        .from('matches')
        .insert({
          run_id: runId,
          external_fixture_id: noPick.fixture.externalId,
          competition: noPick.fixture.competition,
          home_team: noPick.fixture.home.name,
          away_team: noPick.fixture.away.name,
          kickoff: noPick.fixture.kickoff,
          stage: 'entered',
        })
        .select('id')
        .single();

      if (!matchRow) continue;

      await supabase.from('picks').insert({
        run_id: runId,
        match_id: matchRow.id,
        market: 'O/U',
        tier: 'NO-PICK',
        is_pick: false,
        no_pick_reason: noPick.reason,
      });
    }

    await supabase
      .from('runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        scanned_count: summary.scanned,
        entered_count: summary.entered,
        held_count: summary.held,
        dropped_count: summary.dropped,
        cost_usd: summary.costUsd,
        progress_pct: 100,
        progress_stage: 'Done',
      })
      .eq('id', runId);
  } catch (error) {
    await supabase
      .from('runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        progress_stage: 'Failed',
      })
      .eq('id', runId);
  }
}
