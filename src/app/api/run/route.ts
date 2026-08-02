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

// Must be a literal - Next.js reads route segment config via static analysis,
// not by executing the module, so this can't reference config.ts. Keep in
// sync with config.limits.runMaxDurationSeconds by hand.
export const maxDuration = 300;

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

  // Idempotency: refuse a new run while one is already in flight - but only
  // treat a 'running' row as genuinely in flight if it started recently. A
  // run whose background execution died without hitting the catch block
  // (the platform hard-killing the function at maxDuration, a hung fetch
  // with no timeout) leaves the row stuck at 'running' forever otherwise,
  // permanently blocking every future run until someone fixes it by hand.
  // maxDuration is 300s; five minutes of slack past that is enough for a
  // real run to still be legitimately mid-flight without also being an
  // effectively infinite lockout.
  const staleCutoff = new Date(Date.now() - (config.limits.runMaxDurationSeconds + config.limits.staleRunGraceSeconds) * 1000).toISOString();
  const { data: inFlight } = await supabase.from('runs').select('id').eq('status', 'running').gte('started_at', staleCutoff).limit(1);
  if (inFlight && inFlight.length > 0) {
    return NextResponse.json({ error: 'A run is already in progress.' }, { status: 409 });
  }

  // Two rolling-window caps, both counted from the database so they survive
  // across serverless invocations. Failed runs don't count toward either - a
  // run that died before scanning a single fixture isn't a real attempt.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since5d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const [{ count: count24h }, { count: count5d }] = await Promise.all([
    supabase.from('runs').select('id', { count: 'exact', head: true }).gte('started_at', since24h).neq('status', 'failed'),
    supabase.from('runs').select('id', { count: 'exact', head: true }).gte('started_at', since5d).neq('status', 'failed'),
  ]);
  if ((count24h ?? 0) >= config.limits.maxRunsPerDay) {
    return NextResponse.json({ error: `Max ${config.limits.maxRunsPerDay} runs per 24 hours reached.` }, { status: 429 });
  }
  if ((count5d ?? 0) >= config.limits.maxRunsPer5Days) {
    return NextResponse.json({ error: `Max ${config.limits.maxRunsPer5Days} runs per 5 days reached.` }, { status: 429 });
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
