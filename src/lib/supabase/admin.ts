// A service-role Supabase client, used ONLY by server-only code that needs to
// bypass RLS - the api_cache/api_usage infra tables (which intentionally have no
// RLS policies, see the migration comment) and the settlement cron. Never import
// this from a client component or anywhere that runs in the browser: the service
// key it uses can read and write every row in the database, ignoring RLS entirely.
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

export function createAdminClient() {
  if (!config.supabase.serviceKey) {
    throw new Error('SUPABASE_SERVICE_KEY is not set - required for server-only admin operations.');
  }
  return createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false },
  });
}
