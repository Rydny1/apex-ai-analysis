// Browser-side Supabase client - uses the public anon key, which is safe to ship
// to the client because every table it can touch is protected by the RLS
// policies in the initial migration (owner_id = auth.uid()).
import { createBrowserClient } from '@supabase/ssr';
import { config } from '../config';

export function createClient() {
  return createBrowserClient(config.supabase.url, config.supabase.anonKey);
}
