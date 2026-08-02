import Link from 'next/link';
import { Reveal } from '@/components/Reveal';
import { BackLink } from '@/components/BackLink';

// Blog-style, first person, portfolio-friendly - the audience here is an
// interviewer or reviewer deciding whether the engineer behind this can
// reason about a real system, not a first-time user of the product. See
// the redesign brief's copy voice rules: no exclamation marks, no "unlock",
// contractions on, cut half the words when in doubt.
export default function AboutPage() {
  return (
    <div className="min-h-full bg-canvas text-ink">
      <header className="border-b border-hair">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-5">
            <BackLink />
            <Link href="/" className="text-[14px] font-medium tracking-[0.24em] text-ink">
              A P E X
            </Link>
          </div>
          <Link href="/login" className="text-[13px] text-ink-muted hover:text-ink">
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-16">
        <Reveal>
          <h1 className="font-serif text-[37px] leading-tight text-ink">
            Why <span className="italic text-accent">APEX</span> exists
          </h1>
        </Reveal>

        <Reveal delay={0.05}>
          <div className="mt-6 space-y-4 text-[16px] leading-relaxed text-ink-secondary">
            <p>
              Most public betting content chases certainty. A pick with an 85% gut-feel probability at 1.05 odds
              reads as safe, and it sells, because &quot;confident&quot; feels like the same thing as &quot;correct.&quot; It
              isn&apos;t. A bookmaker prices that same match knowing exactly what everyone else knows, and a 1.05
              price already has that certainty baked in. Betting on it is a slow way to lose money, one small stake
              at a time.
            </p>
            <p>
              I built APEX to test a narrower, less comfortable claim: probability by itself is worthless. What
              matters is whether your probability disagrees with the market&apos;s, in your favor, by enough to
              survive the vig. That disagreement is the entire product. Everything else - the data pulls, the
              prompt design, the Poisson math - exists to produce one honest number and compare it to one honest
              price.
            </p>
          </div>
        </Reveal>

        <Reveal delay={0.05}>
          <section className="mt-14">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">The one rule</p>
            <h2 className="mt-3 font-serif text-[28px] text-ink">The VALUE GATE</h2>
            <div className="mt-4 space-y-4 text-[16px] leading-relaxed text-ink-secondary">
              <p>
                Every candidate pick gets reduced to one comparison: <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[14px] text-ink">edge = P_apex − P_implied</code>.
                <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[14px] text-ink"> P_apex</code> is
                APEX&apos;s own probability for the outcome, built from form, a goals-rate proxy for xG, standings
                context, and lineup news. <code className="rounded bg-inset px-1.5 py-0.5 font-mono text-[14px] text-ink">P_implied</code> is
                the market&apos;s price, de-vigged so the bookmaker&apos;s margin doesn&apos;t masquerade as edge.
              </p>
              <blockquote className="border-l-2 border-accent/40 pl-4 font-serif text-[21px] italic leading-snug text-ink">
                If the edge doesn&apos;t clear a minimum threshold, there is no pick. Not a weak pick. No pick.
              </blockquote>
              <p>
                That&apos;s the part most tools skip, because an empty week doesn&apos;t look like a product working. It
                is one. A market can be efficient enough that nothing clears the bar, and the honest response to
                that is silence, not a manufactured pick to keep the feed full.
              </p>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.05}>
          <section className="mt-14">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Limits</p>
            <h2 className="mt-3 font-serif text-[28px] text-ink">What it does and does not do</h2>
            <div className="mt-4 space-y-4 text-[16px] leading-relaxed text-ink-secondary">
              <p>
                APEX does not guarantee profit, on any single pick or any given week. Football is variance-heavy
                over small samples, and a correct model can still lose a run of bets it should have won on paper.
                What it can do is produce a repeatable process and measure whether that process is actually
                finding edge, rather than getting lucky.
              </p>
              <p>
                The measure is closing line value, not win rate. A pick can lose and still be correct if the price
                moved in APEX&apos;s favor before kickoff - that means the market agreed with the read, late. A pick
                can win and still be wrong if the price moved against it - that&apos;s a coin flip that happened to
                land right. CLV is the only one of the two that survives a larger sample, which is why the tracking
                page reports it as a first-class number, not a footnote.
              </p>
            </div>
          </section>
        </Reveal>

        <Reveal delay={0.05}>
          <section className="mt-14">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Stack</p>
            <h2 className="mt-3 font-serif text-[28px] text-ink">What it&apos;s built with</h2>
            <ul className="mt-4 space-y-4 text-[16px] leading-relaxed text-ink-secondary">
              <li>
                <span className="text-ink">Next.js (App Router) + TypeScript.</span> Server components for every
                data-bearing page, client islands only where something genuinely needs interaction - the run
                button, the ledger sort, the login card.
              </li>
              <li>
                <span className="text-ink">Supabase (Postgres, Auth, RLS).</span> Row-level security scopes every
                real run to the account that made it, which is also what let guest mode ship without a separate
                auth system - a guest is just a role with no run permissions, enforced in Postgres, not in a
                conditional in the UI.
              </li>
              <li>
                <span className="text-ink">Anthropic Claude Sonnet 5, with prompt caching and batching.</span> The
                model is used for the parts that need judgment - reading team news, arguing the case against its
                own pick - and nowhere else. Triage, the Poisson goals math, the VALUE GATE comparison, and staking
                are all deterministic TypeScript. If a step can be code, it&apos;s code; the model is judgment, not
                arithmetic.
              </li>
              <li>
                <span className="text-ink">Free-tier data: API-Football and football-data.org.</span> Chosen over
                a paid provider on purpose - a personal project should prove the idea works within a real
                constraint, not assume an unlimited data budget.
              </li>
              <li>
                <span className="text-ink">Vercel.</span> Deploys on push, cron for the daily settlement job.
              </li>
            </ul>
          </section>
        </Reveal>

        <Reveal delay={0.05}>
          <section className="mt-14 border-t border-hair pt-10">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Who built it</p>
            <p className="mt-3 text-[16px] leading-relaxed text-ink-secondary">
              I&apos;m Rydny, first-year Computer Science at the University of Latvia. APEX started as a question I
              wanted a real answer to - whether a strict, rules-first system could show a positive edge signal over
              a real sample, not a backtest - and turned into the largest thing I&apos;ve shipped end to end: data
              layer, model, auth, and the UI in front of it. The code is on{' '}
              <a href="https://github.com/Rydny1/apex-ai-analysis" target="_blank" rel="noopener noreferrer" className="text-accent hover:brightness-110">
                GitHub
              </a>
              , and more of what I&apos;ve built is at{' '}
              <a href="https://rydny1.github.io/Rydny-portfolio/" target="_blank" rel="noopener noreferrer" className="text-accent hover:brightness-110">
                my portfolio
              </a>
              .
            </p>
          </section>
        </Reveal>

        <div className="mt-16 border-t border-hair pt-8">
          <BackLink />
        </div>
      </main>
    </div>
  );
}
