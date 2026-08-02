// Single-user allowlist check. This app has exactly one owner - Supabase Auth
// handles the actual login, but middleware.ts calls this on every request to make
// sure the signed-in email matches the one owner this app is built for. Defense
// in depth: even if someone else's Supabase account somehow got created, they'd
// be signed out here rather than seeing the owner's runs and picks (RLS would
// already stop them reading data, but this stops them from even landing on a page).
import { config } from './config';

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email || !config.owner.email) return false;
  return email.toLowerCase() === config.owner.email.toLowerCase();
}
