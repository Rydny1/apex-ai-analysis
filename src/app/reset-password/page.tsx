'use client';

// Landed on after clicking a password-reset email link (see the login page's
// "Forgot password?" flow). By this point /auth/callback has already exchanged
// the emailed code for a real session, so this just needs to set a new password
// on that session - no separate token handling here.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus('submitting');
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message);
      return;
    }
    router.push('/run');
    router.refresh();
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6">
      <div className="w-full max-w-[320px]">
        <p className="text-center text-[15px] font-medium text-ink">APEX</p>
        <div className="mt-8 rounded-md border border-line bg-surface-1 p-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              required
              autoFocus
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded border border-line bg-surface-0 px-3 py-2 text-[13px] text-ink outline-none focus:border-blue focus:ring-2 focus:ring-blue/30"
            />
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full rounded bg-blue px-3 py-2 text-[13px] font-medium text-white transition-colors hover:brightness-110 disabled:opacity-60"
            >
              {status === 'submitting' ? 'Saving…' : 'Set password'}
            </button>
            {errorMessage ? <p className="text-[11px] text-red">{errorMessage}</p> : null}
          </form>
        </div>
      </div>
    </div>
  );
}
