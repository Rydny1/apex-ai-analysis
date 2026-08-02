// Tiered-TTL cache, backed by the `api_cache` Supabase table rather than an
// in-memory Map. This matters on Vercel: serverless functions don't share memory
// between invocations, so an in-memory cache would be reset on every request and
// never actually save any API calls. A shared table survives across runs, which is
// exactly where the request-budget savings come from (see AUDIT.md item 4).
import 'server-only';
import { createAdminClient } from '../supabase/admin';

// How long to trust cached data before re-fetching, per the brief's volatility
// tiers: slow-changing data (results, season goal rates, standings) can sit for a
// day; anything that affects a live price (odds, confirmed lineups) is refetched
// almost immediately.
export const CACHE_TTL_SECONDS = {
  standingsAndResults: 60 * 60 * 24, // 24h - doesn't change intra-day
  lineupsAndOdds: 60 * 2, // 2 minutes - must stay close to live
} as const;

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('api_cache')
    .select('payload, fetched_at, ttl_seconds')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (error || !data) return null;

  const ageSeconds = (Date.now() - new Date(data.fetched_at).getTime()) / 1000;
  if (ageSeconds > data.ttl_seconds) return null; // expired - treat as a cache miss

  return data.payload as T;
}

export async function setCached<T>(cacheKey: string, payload: T, ttlSeconds: number): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('api_cache').upsert({
    cache_key: cacheKey,
    payload: payload as object,
    fetched_at: new Date().toISOString(),
    ttl_seconds: ttlSeconds,
  });
}

// Fetch-through helper: return the cached value if it's still fresh, otherwise
// call `fetchFn`, cache the result, and return that. This is the shape almost
// every data-layer client uses, so it lives here once instead of being repeated
// in api-football.ts / football-data-org.ts / odds.ts.
export async function cached<T>(cacheKey: string, ttlSeconds: number, fetchFn: () => Promise<T>): Promise<T> {
  const existing = await getCached<T>(cacheKey);
  if (existing !== null) return existing;

  const fresh = await fetchFn();
  await setCached(cacheKey, fresh, ttlSeconds);
  return fresh;
}
