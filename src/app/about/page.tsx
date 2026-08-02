import Link from 'next/link';

// A plain, human explanation of what APEX is and how it works. No jargon, no
// tables, no numbers to parse - just short sentences a person with zero
// football-betting or software background could read once and understand.
// Public (see PUBLIC_PATHS in proxy.ts) so it's reachable straight from the
// login screen, before anyone signs in.
export default function AboutPage() {
  return (
    <div className="min-h-full bg-surface-0 text-ink">
      <header className="border-b border-line" style={{ borderBottomWidth: '0.5px' }}>
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link href="/login" className="text-[15px] font-medium tracking-[0.08em] text-ink">
            APEX
          </Link>
          <Link href="/login" className="text-[13px] text-ink-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-[26px] font-medium text-ink">What is APEX?</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-muted">
          A simple, honest explanation. No football knowledge needed.
        </p>

        <Section title="The short version">
          <p>
            APEX looks at football matches before they happen. It studies the numbers
            behind each game. Then it tells you which matches look worth a bet, and which
            do not.
          </p>
          <p>
            Think of it like a very careful friend who studies football all week, then
            gives you one short, honest opinion before kickoff.
          </p>
        </Section>

        <Section title="How does it decide">
          <p>APEX looks at a handful of things for every match, such as:</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>How well each team has played in its last few games.</li>
            <li>Who is injured or missing from the lineup.</li>
            <li>How much each team needs the win.</li>
          </ul>
          <p className="mt-3">
            For example, a team fighting to avoid relegation usually tries harder than a
            team that is already safe with nothing left to play for. APEX notices things
            like that.
          </p>
          <p>It turns everything it finds into one simple number: how likely a result is.</p>
        </Section>

        <Section title="Why does it sometimes say no bet">
          <p>
            A likely result is not always a good bet. Say a team is very likely to win.
            The bookmaker already knows that too, so the payout for betting on them is
            tiny.
          </p>
          <p>
            In that case, APEX says no bet. Not because the team will lose. Because the
            reward is not worth the risk.
          </p>
          <p>
            This happens more often than you might expect, and that is a good sign. It
            means APEX is being honest, not greedy.
          </p>
        </Section>

        <Section title="How do you use it">
          <p>You press one button, up to three times a day.</p>
          <p>
            APEX then checks the coming week of matches and gives you a short list of its
            best picks. Each pick shows the match, the odds, and a short reason why APEX
            likes it.
          </p>
        </Section>

        <Section title="Is it always right">
          <p>No. Nothing is. Football is unpredictable. That is what makes it exciting.</p>
          <p>
            APEX keeps score of its own picks over time, win or lose. So you can always
            see how it is really doing, instead of just guessing.
          </p>
        </Section>

        <div className="mt-16 border-t border-line pt-8" style={{ borderTopWidth: '0.5px' }}>
          <Link href="/login" className="text-[13px] font-medium text-blue hover:brightness-110">
            Back to sign in
          </Link>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[13px] font-medium uppercase tracking-wide text-ink-muted">{title}</h2>
      <div className="mt-3 space-y-3 text-[16px] leading-relaxed text-ink">{children}</div>
    </section>
  );
}
