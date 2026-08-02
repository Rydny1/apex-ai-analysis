// Vercel Cron entry point - runs once a day, settling any picks whose match has
// finished. This is the one cron job the build brief explicitly allows ("a small
// settlement cron is allowed"); it is NOT the analysis trigger, which stays
// manual-only. Protected by a shared secret so only Vercel's own cron scheduler
// (or the owner, manually, with the secret) can invoke it.
import { NextResponse } from 'next/server';
import { settleFinishedPicks } from '@/lib/engine/settle-picks';

export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const result = await settleFinishedPicks();
  return NextResponse.json(result);
}
