// Enforces the free-tier request budgets in code (AUDIT.md item 4), backed by the
// `api_usage` table so the count survives across serverless invocations within the
// same day. Every provider client must call `checkAndIncrementBudget` before
// making a real network request - if the day's budget is spent, the call is
// refused here instead of silently hitting the provider's own rate limit (which
// would come back as a confusing 429 deep inside a run).
import 'server-only';
import { createAdminClient } from '../supabase/admin';
import { config } from '../config';

export type Provider = 'api-football' | 'football-data-org' | 'odds-api';

const DAILY_BUDGET: Record<Provider, number> = {
  'api-football': config.apiFootball.dailyRequestBudget,
  'football-data-org': 0, // rate-limited per-minute instead, not a daily count - see below
  'odds-api': config.oddsApi.monthlyCreditBudget,
};

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Returns true and records the call if the provider still has budget left today;
// returns false (and records nothing) if the budget is already spent. Callers must
// treat `false` as "fall back to a different provider or cached data," never as
// "try again anyway."
export async function checkAndIncrementBudget(provider: Provider): Promise<boolean> {
  const budget = DAILY_BUDGET[provider];
  if (budget === 0) return true; // providers without a daily-count budget (see football-data-org's own rate limiter)

  const supabase = createAdminClient();
  const usageDate = todayDateString();

  const { data: existing } = await supabase
    .from('api_usage')
    .select('request_count')
    .eq('provider', provider)
    .eq('usage_date', usageDate)
    .maybeSingle();

  const currentCount = existing?.request_count ?? 0;
  if (currentCount >= budget) return false;

  await supabase
    .from('api_usage')
    .upsert({ provider, usage_date: usageDate, request_count: currentCount + 1 }, { onConflict: 'provider,usage_date' });

  return true;
}
