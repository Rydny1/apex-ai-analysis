// Odds client: the-odds-api. Free tier is ~500 credits/month (AUDIT.md items 1/8).
// Only h2h/totals/spreads are requested - those are the markets this free tier
// reliably returns for soccer. If a bookmaker happens to also carry BTTS/corners/
// cards, `bookmakers[].markets` will simply include extra entries the caller can
// use - but nothing here assumes they exist.
import 'server-only';
import { config } from '../config';
import { checkAndIncrementBudget } from './rate-budget';
import { oddsApiResponseSchema } from './schemas';

const REQUESTED_MARKETS = 'h2h,totals,spreads';

// Odds must always be fetched fresh right before the VALUE GATE runs (S7) - never
// cached, since a stale price is exactly the failure mode the spec warns about
// ("a pick built at 2.10 that is now 1.62 has no edge left").
export async function fetchFreshOdds(sportKey: string) {
  const canProceed = await checkAndIncrementBudget('odds-api');
  if (!canProceed) {
    throw new Error('the-odds-api monthly credit budget is spent - this run cannot re-price against fresh odds.');
  }

  const url = new URL(`${config.oddsApi.baseUrl}/sports/${sportKey}/odds`);
  url.searchParams.set('apiKey', config.oddsApi.apiKey);
  url.searchParams.set('regions', 'uk,eu');
  url.searchParams.set('markets', REQUESTED_MARKETS);
  url.searchParams.set('oddsFormat', 'decimal');

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`the-odds-api request failed: ${response.status} ${response.statusText}`);
  }

  return oddsApiResponseSchema.parse(await response.json());
}
