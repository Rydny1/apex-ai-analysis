// Refreshes the Supabase session on every request and enforces the single-owner
// allowlist (see lib/auth.ts) - anyone signed in as someone other than the owner
// is redirected to login instead of ever reaching a page with real data on it.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { config as appConfig } from './lib/config';
import { isOwnerEmail } from './lib/auth';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/about'];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(appConfig.supabase.url, appConfig.supabase.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.some((path) => request.nextUrl.pathname.startsWith(path));

  if (!isPublicPath && (!user || !isOwnerEmail(user.email))) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
