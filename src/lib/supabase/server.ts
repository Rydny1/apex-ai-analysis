// Server-side Supabase client for Server Components and Route Handlers - reads
// the session from cookies, so RLS applies as the actually-signed-in owner (not
// the elevated service role - see admin.ts for the one place that needs that).
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { config } from '../config';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component that can't set cookies - safe to
          // ignore as long as middleware.ts is also refreshing the session.
        }
      },
    },
  });
}
