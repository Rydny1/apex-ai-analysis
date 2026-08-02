// Called once right after a successful sign-in or sign-up (see login/page.tsx).
// Upserts the caller's own profiles row, setting role to 'admin' only if their
// email matches ADMIN_EMAIL - every other account stays 'guest'. The RLS
// policies on profiles only allow a user to write their own row, so this can
// never be used to grant admin to a different account.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { config } from '@/lib/config';

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const role = config.admin.email && user.email === config.admin.email ? 'admin' : 'guest';

  await supabase.from('profiles').upsert({ id: user.id, role }, { onConflict: 'id' });

  return NextResponse.json({ role });
}
