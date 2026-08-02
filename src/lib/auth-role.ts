import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { config } from './config';

export type Role = 'guest' | 'admin';

// Reads the caller's role for the current request. Falls back to a direct
// email comparison if the profiles row hasn't been created yet (e.g. a
// signup where the client's /api/auth/sync-profile call raced the page
// load) - the stored role is the source of truth once it exists.
export async function getRole(supabase: SupabaseClient, user: User | null): Promise<Role> {
  if (!user) return 'guest';

  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (data?.role === 'admin' || data?.role === 'guest') return data.role;

  return config.admin.email && user.email === config.admin.email ? 'admin' : 'guest';
}
