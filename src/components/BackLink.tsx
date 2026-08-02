'use client';

// A real "go back" control - /about is linked from both the homepage and the
// login page now, so a hardcoded "Back to sign in" is wrong half the time.
// router.back() returns to whatever actually referred here; if there's no
// history to go back to (a direct link, a new tab), falls back to home.
import { useRouter } from 'next/navigation';

export function BackLink() {
  const router = useRouter();

  function handleClick() {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  }

  return (
    <button type="button" onClick={handleClick} className="text-[13px] font-medium text-accent hover:brightness-110">
      ‹ Back
    </button>
  );
}
