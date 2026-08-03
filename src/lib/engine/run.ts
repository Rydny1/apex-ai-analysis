// Orchestrates one full triggered run: S1 scan -> S2 triage -> S3 data pull -> S4
// motivation/market-fit -> S5 build -> S6 break-the-pick -> S7 gate. This is the
// only file that calls every pipeline stage in order - everything else in
// lib/engine/pipeline/* is a pure, independently-testable function.
import 'server-only';
import { config } from '../config';
import { fetchMatches, fetchStandings } from '../data/football-data-org';
import { fetchFreshOdds } from '../data/odds';
import { normalizeFdoFixture, normalizeFdoGoalsRate, normalizeFdoStandingsRow, normalizeOddsEvent, buildTeamForm } from '../data/normalize';
import { deriveMotivationState } from './pipeline/motivation';
import { triageMatch, capShortlist, type TriageResult } from './pipeline/s2-triage';
import { formSignal, goalsRateDifferentialSignal, motivationSignal, meetsMinimumSignalCount } from './pipeline/signals';
import { computeLineupPenalty, computeVolatilityPenalty } from './pipeline/penalties';
import { expectedGoals, probabilityOverTotalGoals, reconcileWithPoisson } from './pipeline/poisson';
import { getBaseRatePct } from './pipeline/base-rates';
import { buildCandidateProbability, applyBreakThePickPenalty } from './pipeline/s5-build';
import { runBreakThePick, breakThePickForcesNoPick } from './pipeline/s6-break';
import { buildGatedPick } from './pipeline/s7-gate';
import { getQualitativeRead, estimateCostUsd } from './llm';
import type { GatedPick, LineupInfo, NormalizedFixture, PricedCandidate, StandingsSnapshot, TeamGoalsRate } from './types';

export interface RunSummary {
  scanned: number;
  entered: number;
  held: number;
  dropped: number;
  costUsd: number;
  picks: GatedPick[];
  noPicks: { fixture: NormalizedFixture; reason: string }[];
  droppedLog: { competition: string; teams: string; reason: string }[];
}

// A simplified per-match shape used only inside run.ts to carry S3 data between
// stages, before it's assembled into the engine's PricedCandidate/GatedPick types.
interface MatchWorkingData {
  fixture: NormalizedFixture;
  homeGoalsRate: TeamGoalsRate;
  awayGoalsRate: TeamGoalsRate;
  homeStandings: StandingsSnapshot;
  awayStandings: StandingsSnapshot;
  homeLineup: LineupInfo;
  awayLineup: LineupInfo;
}

export type ProgressReporter = (pct: number, stage: string) => Promise<void> | void;
const noopProgress: ProgressReporter = () => {};

export async function runPipeline(onProgress: ProgressReporter = noopProgress): Promise<RunSummary> {
  let costUsd = 0;
  const droppedLog: RunSummary['droppedLog'] = [];
  const noPicks: RunSummary['noPicks'] = [];
  const picks: GatedPick[] = [];

  // --- S1: SCAN --------------------------------------------------------------
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dateFrom = now.toISOString().slice(0, 10);
  const dateTo = windowEnd.toISOString().slice(0, 10);

  await onProgress(2, 'Scanning fixtures');
  // Standings fetched once per league here (not per fixture in S2 below) - both
  // to avoid an N+1 call pattern and because football-data.org's free tier has
  // no separate team-stats endpoint: goals rate is derived from these same rows.
  const standingsByLeague = new Map<string, Awaited<ReturnType<typeof fetchStandings>>>();
  const fixturesWithLeague: { fixture: NormalizedFixture; leagueCode: string }[] = [];
  const leagueCodes = Object.values(config.leagues);
  for (let i = 0; i < leagueCodes.length; i++) {
    // Sequential, not Promise.all: the client's own inter-call spacing (see
    // football-data-org.ts) only serializes calls that actually await each
    // other - two calls fired together both read the "last call" time before
    // either updates it, so they go out almost together instead of 6s apart.
    // That's exactly what triggered a real 429 from the API on the first run.
    const rawMatches = await fetchMatches(leagueCodes[i], dateFrom, dateTo);
    const standingsRaw = await fetchStandings(leagueCodes[i]);
    standingsByLeague.set(leagueCodes[i], standingsRaw);
    for (const raw of rawMatches) fixturesWithLeague.push({ fixture: normalizeFdoFixture(raw), leagueCode: leagueCodes[i] });
    await onProgress(2 + Math.round(((i + 1) / leagueCodes.length) * 13), 'Scanning fixtures');
  }
  const allFixtures = fixturesWithLeague.map((f) => f.fixture);

  // --- S2: TRIAGE --------------------------------------------------------------
  const enteredCandidates: (MatchWorkingData & { goalsRateDifferential: number })[] = [];
  let heldCount = 0;

  for (let fixtureIndex = 0; fixtureIndex < fixturesWithLeague.length; fixtureIndex++) {
    const { fixture, leagueCode } = fixturesWithLeague[fixtureIndex];
    await onProgress(15 + Math.round((fixtureIndex / Math.max(1, fixturesWithLeague.length)) * 25), 'Triaging fixtures');
    // A cold-start simplification: without a per-fixture odds/lineup pre-check
    // this early, S2 triages on what's cheaply knowable from the fixture alone
    // (kickoff time) and defers the odds/no-signal checks to right after the
    // standings lookup below, since that's the earliest point real numbers
    // exist to triage on.
    if (new Date(fixture.kickoff) < now) {
      droppedLog.push({ competition: fixture.competition, teams: `${fixture.home.name} vs ${fixture.away.name}`, reason: 'Already kicked off.' });
      continue;
    }

    const standingsRaw = standingsByLeague.get(leagueCode) ?? [];
    const totalTeams = standingsRaw.length || 20;
    const homeRow = standingsRaw.find((r) => String(r.team.id) === fixture.home.externalId);
    const awayRow = standingsRaw.find((r) => String(r.team.id) === fixture.away.externalId);
    const totalGamesInSeason = (totalTeams - 1) * 2; // standard round-robin assumption, documented default

    const homeGoalsRate = homeRow ? normalizeFdoGoalsRate(homeRow) : { goalsForPerGame: 1.3, goalsAgainstPerGame: 1.3, gamesPlayed: 0 };
    const awayGoalsRate = awayRow ? normalizeFdoGoalsRate(awayRow) : { goalsForPerGame: 1.3, goalsAgainstPerGame: 1.3, gamesPlayed: 0 };
    const goalsRateDifferential = Math.abs(
      (homeGoalsRate.goalsForPerGame - homeGoalsRate.goalsAgainstPerGame) - (awayGoalsRate.goalsForPerGame - awayGoalsRate.goalsAgainstPerGame)
    );

    const homeStandings = homeRow
      ? normalizeFdoStandingsRow(homeRow, totalTeams, totalGamesInSeason, totalTeams - 3, 4)
      : neutralStandings(totalTeams);
    const awayStandings = awayRow
      ? normalizeFdoStandingsRow(awayRow, totalTeams, totalGamesInSeason, totalTeams - 3, 4)
      : neutralStandings(totalTeams);

    const triage: TriageResult = triageMatch({
      hasOdds: true, // confirmed later at S7's fresh re-pull; a missing-odds drop there still logs correctly as NO-PICK
      alreadyKickedOff: false,
      bothTeamsDeadRubber: homeStandings.gamesRemaining === 0 || awayStandings.gamesRemaining === 0,
      goalsRateDifferential,
      hasIncentiveAngle:
        deriveMotivationState({ standings: homeStandings }) !== 'NEUTRAL' || deriveMotivationState({ standings: awayStandings }) !== 'NEUTRAL',
      managerSackedWithin48h: false, // no free-tier signal for this - documented as always-false rather than guessed
      managerReplacementClarity: true,
      lineupSensitiveMarketUnconfirmed: false, // goals-market default selection below isn't lineup-sensitive
    });

    if (triage.stage === 'dropped') {
      droppedLog.push({ competition: fixture.competition, teams: `${fixture.home.name} vs ${fixture.away.name}`, reason: triage.reason });
      continue;
    }
    if (triage.stage === 'held') {
      heldCount += 1;
      continue;
    }

    enteredCandidates.push({
      fixture,
      homeGoalsRate,
      awayGoalsRate,
      homeStandings,
      awayStandings,
      homeLineup: { confirmed: false, minutesToKickoff: null, absences: [], rotationsExpected: 0 },
      awayLineup: { confirmed: false, minutesToKickoff: null, absences: [], rotationsExpected: 0 },
      goalsRateDifferential,
    });
  }

  const { kept, overflow } = capShortlist(enteredCandidates, config.limits.maxMatchesPerRun);
  for (const match of overflow) {
    droppedLog.push({ competition: match.fixture.competition, teams: `${match.fixture.home.name} vs ${match.fixture.away.name}`, reason: 'Shortlist cap (12) reached - not analyzed.' });
  }

  // --- S3-S7 per shortlisted match ---------------------------------------------
  await onProgress(40, kept.length > 0 ? `Pricing ${kept.length} shortlisted match${kept.length === 1 ? '' : 'es'}` : 'No matches shortlisted');
  for (let matchIndex = 0; matchIndex < kept.length; matchIndex++) {
    const match = kept[matchIndex];
    await onProgress(
      40 + Math.round((matchIndex / Math.max(1, kept.length)) * 58),
      `Pricing ${match.fixture.home.name} vs ${match.fixture.away.name}`
    );
    if (costUsd >= config.limits.perRunCostGuardUsd) {
      droppedLog.push({ competition: match.fixture.competition, teams: `${match.fixture.home.name} vs ${match.fixture.away.name}`, reason: 'Per-run cost guard reached - finishing with what is already priced.' });
      continue;
    }

    // S4: motivation + the market this build prices by default. A full multi-axis
    // market-fit selection across all nine spec markets is future scope for this
    // "lite" build - v1 always prices Over/Under 2.5 goals, the market with the
    // most reliable free-tier odds coverage (AUDIT.md item 1) and a clean Poisson
    // model from the goals-rate proxy.
    const homeMotivation = deriveMotivationState({ standings: match.homeStandings });
    const awayMotivation = deriveMotivationState({ standings: match.awayStandings });

    const lambdaHome = expectedGoals(match.homeGoalsRate.goalsForPerGame, match.awayGoalsRate.goalsAgainstPerGame);
    const lambdaAway = expectedGoals(match.awayGoalsRate.goalsForPerGame, match.homeGoalsRate.goalsAgainstPerGame);
    const poissonOverPct = probabilityOverTotalGoals(lambdaHome, lambdaAway, 2.5) * 100;

    const signals = [
      goalsRateDifferentialSignal(match.homeGoalsRate, match.awayGoalsRate),
      motivationSignal(homeMotivation, awayMotivation),
      formSignal(buildTeamForm([]), buildTeamForm([])), // form history pull is future scope for this build - contributes 0 until wired up
    ].filter((s) => s.pctPoints > 0);

    if (!meetsMinimumSignalCount(signals.length, true)) {
      noPicks.push({ fixture: match.fixture, reason: 'Fewer than the minimum independent signals required.' });
      continue;
    }

    const lineupPenalty = computeLineupPenalty(match.homeLineup, false);
    const volatilityPenalty = computeVolatilityPenalty({
      derby: false,
      relegationSixPointer: homeMotivation === 'MUST_WIN' && awayMotivation === 'MUST_WIN',
      newManagerWithin3Matches: false,
      bothManagersRotating: false,
      europeanKnockoutWithin4Days: false,
      longTravelOver3500km: false,
    });

    const heuristicPct = 50 + signals.reduce((s, sig) => s + (sig.direction === 'for' ? sig.pctPoints : -sig.pctPoints), 0);
    const reconciledPct = reconcileWithPoisson(heuristicPct, poissonOverPct);

    const build = buildCandidateProbability({
      baseRatePct: getBaseRatePct(match.fixture.baseRateKey as never, 'O2_5') ?? reconciledPct,
      signals,
      penalties: {
        lineupPenaltyPct: lineupPenalty.penaltyPct,
        volatilityPenaltiesRaw: volatilityPenalty.volatilityPenaltiesRaw,
        volatilityPenaltyAppliedPct: volatilityPenalty.volatilityPenaltyAppliedPct,
      },
    });

    // S6: break the pick.
    const matchSummary = `${match.fixture.home.name} vs ${match.fixture.away.name}, ${match.fixture.competition}. Goals rate (for/against per game): home ${match.homeGoalsRate.goalsForPerGame.toFixed(2)}/${match.homeGoalsRate.goalsAgainstPerGame.toFixed(2)}, away ${match.awayGoalsRate.goalsForPerGame.toFixed(2)}/${match.awayGoalsRate.goalsAgainstPerGame.toFixed(2)}. Motivation: home ${homeMotivation}, away ${awayMotivation}.`;
    const pickSummary = `Over 2.5 goals at ${build.cappedPct.toFixed(1)}% built probability.`;

    let breakResult;
    try {
      const breakOutcome = await runBreakThePick(matchSummary, pickSummary);
      breakResult = breakOutcome.result;
      costUsd += breakOutcome.costUsd;

      const qualitativeOutcome = await getQualitativeRead(matchSummary);
      costUsd += estimateCostUsd(qualitativeOutcome.cost);
    } catch {
      // A model-call failure degrades to a held pick, not a crash of the whole run.
      noPicks.push({ fixture: match.fixture, reason: 'LLM call failed - held rather than priced without a break-the-pick check.' });
      continue;
    }

    if (breakThePickForcesNoPick(breakResult)) {
      noPicks.push({ fixture: match.fixture, reason: 'Break-the-pick severity STRONG - no alternate market queued, so NO-PICK.' });
      continue;
    }

    const finalPct = applyBreakThePickPenalty(build.cappedPct, breakResult.penaltyPct);

    const candidate: PricedCandidate = {
      fixture: match.fixture,
      market: 'O/U',
      line: '2.5',
      baseRatePct: getBaseRatePct(match.fixture.baseRateKey as never, 'O2_5'),
      signals,
      motivation: { home: homeMotivation, away: awayMotivation },
      penalties: {
        lineupPenaltyPct: lineupPenalty.penaltyPct,
        volatilityPenaltiesRaw: volatilityPenalty.volatilityPenaltiesRaw,
        volatilityPenaltyAppliedPct: volatilityPenalty.volatilityPenaltyAppliedPct,
      },
      rawPct: build.rawPct,
      finalPct,
      breakThePick: breakResult,
    };

    // S7: re-pull fresh odds and run the VALUE GATE - never trust the S3 snapshot.
    let freshOdds = null;
    try {
      const sportKey = 'soccer'; // the-odds-api's generic soccer key; specific league keys are future scope
      const events = await fetchFreshOdds(sportKey);
      const matchEvent = events.find((e) => e.home_team === match.fixture.home.name && e.away_team === match.fixture.away.name);
      freshOdds = matchEvent ? normalizeOddsEvent(matchEvent).find((q) => q.market === 'O/U' && q.line === '2.5' && q.side === 'Over') ?? null : null;
    } catch {
      freshOdds = null; // no live odds -> the gate below correctly returns NO-PICK
    }

    const gated = buildGatedPick({
      candidate,
      market: 'O/U',
      freshOdds,
      confidence: {
        model: build.cappedPct,
        data: freshOdds ? 80 : 40, // documented default: no live odds this late is itself a data-quality signal
        lineup: 50, // lineup confirmation isn't wired into S3 in this build - see MatchDataBundle.lineup TODO
      },
      currentLossStreakInTier: 0, // wired to real settlement history in Phase 4's persistence layer
    });

    if (gated.isPick) picks.push(gated);
    else noPicks.push({ fixture: match.fixture, reason: gated.noPickReason ?? 'NO-PICK' });
  }

  await onProgress(100, 'Done');

  return {
    scanned: allFixtures.length,
    entered: kept.length,
    held: heldCount,
    dropped: droppedLog.length,
    costUsd,
    picks,
    noPicks,
    droppedLog,
  };
}

function neutralStandings(totalTeams: number): StandingsSnapshot {
  return {
    position: Math.ceil(totalTeams / 2),
    points: 0,
    gamesPlayed: 0,
    gamesRemaining: 0,
    totalTeams,
    pointsAboveRelegation: null,
    pointsBelowEuropeanSpot: null,
  };
}
