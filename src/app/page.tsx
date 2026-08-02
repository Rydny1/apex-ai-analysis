import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { buildCumulativeSeries, summarizeTrackRecord, type TrackRecordRow } from '@/lib/track-record';
import { HomeNav } from '@/components/home/HomeNav';
import { Hero } from '@/components/home/Hero';
import { MetricStrip } from '@/components/home/MetricStrip';
import { Ticker, type TickerItem } from '@/components/home/Ticker';
import { TrackRecordChart } from '@/components/TrackRecordChart';
import { Reveal } from '@/components/Reveal';

// The public, signed-out homepage - a portfolio landing page, not a redirect
// into the app. Reads the same global_track_record every signed-in page
// reads, so the numbers here are never a separate, prettier set from what a
// signed-in account sees on /tracking.
export default async function HomePage() {
  const supabase = await createClient();
  const { data: rawRows } = await supabase.from('global_track_record').select('*').order('settled_at', { ascending: false });

  const rows: TrackRecordRow[] = (rawRows ?? []).map((r) => ({
    id: r.id,
    settledAt: r.settled_at,
    competition: r.competition,
    matchLabel: r.match_label,
    market: r.market,
    tier: r.tier,
    result: r.result as TrackRecordRow['result'],
    roiPct: r.roi_pct !== null ? Number(r.roi_pct) : null,
    clvPct: r.clv_pct !== null ? Number(r.clv_pct) : null,
    stakePct: Number(r.stake_pct),
  }));

  const summary = summarizeTrackRecord(rows);
  const series = buildCumulativeSeries(rows);

  const weekAgoDate = new Date();
  weekAgoDate.setTime(weekAgoDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const picksThisWeek = rows.filter((r) => new Date(r.settledAt).getTime() >= weekAgoDate.getTime()).length;

  const tickerItems: TickerItem[] = rows.slice(0, 14).map((r) => ({
    id: r.id,
    matchLabel: r.matchLabel,
    market: r.market,
    result: r.result,
    unitsPl: ((r.roiPct ?? 0) * r.stakePct) / 100,
    date: r.settledAt,
  }));

  const last5 = rows.slice(0, 5);

  return (
    <div className="bg-canvas text-ink">
      <HomeNav />
      <Hero picksThisWeek={picksThisWeek} />
      <MetricStrip
        hitRatePct={summary.hitRatePct}
        roiPct={summary.roiPct}
        avgClvPct={summary.avgClvPct}
        bankrollUnits={summary.cumulativeUnits}
      />
      <Ticker items={tickerItems} />

      <HowItWorks />

      <section id="track-record" className="border-t border-hair bg-canvas px-6 py-24 sm:px-8 sm:py-40">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">Live track record</p>
            <h2 className="mt-3 font-serif text-[37px] text-ink">
              The <span className="italic text-accent">real</span> record, not a backtest
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.4fr_1fr]">
            <Reveal delay={0.05}>
              <TrackRecordChart points={series} />
            </Reveal>

            <Reveal delay={0.1}>
              <div className="grid grid-cols-2 gap-3">
                <StatBlock label="Total picks" value={String(summary.totalPicks)} />
                <StatBlock label="Hit rate" value={`${summary.hitRatePct.toFixed(1)}%`} />
                <StatBlock label="ROI" value={`${summary.roiPct >= 0 ? '+' : ''}${summary.roiPct.toFixed(1)}%`} />
                <StatBlock label="CLV positive" value={`${summary.positiveClvRatePct.toFixed(1)}%`} />
              </div>
            </Reveal>
          </div>

          {last5.length > 0 ? (
            <Reveal delay={0.1} className="mt-10">
              <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-muted">Last 5 settled</p>
              <div className="divide-y divide-hair border border-hair">
                {last5.map((r) => {
                  const pl = ((r.roiPct ?? 0) * r.stakePct) / 100;
                  return (
                    <div key={r.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                      <span className="text-ink-secondary">
                        {r.matchLabel} · {r.market}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={r.result === 'win' ? 'text-accent' : r.result === 'loss' ? 'text-loss' : 'text-ink-muted'}>
                          {r.result === 'win' ? 'W' : r.result === 'loss' ? 'L' : r.result}
                        </span>
                        <span className={`tabular font-mono ${pl >= 0 ? 'text-accent' : 'text-loss'}`}>
                          {pl >= 0 ? '+' : ''}
                          {pl.toFixed(2)}u
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Reveal>
          ) : null}
        </div>
      </section>

      <AboutBuild />
      <HomeFooter />
    </div>
  );
}

function HowItWorks() {
  const stages = [
    {
      number: '01',
      title: 'Scan the slate',
      body: 'APEX pulls fixtures for the coming week across 10 leagues, filters out dead rubbers and thin data, and keeps only matches where a signal already exists.',
    },
    {
      number: '02',
      title: 'Price the pick',
      body: "For each candidate, it builds a probability from form, xG proxies, motivation, and lineup news. Then it compares that probability to the market's own implied odds. If APEX doesn't beat the market, there's no pick.",
    },
    {
      number: '03',
      title: 'Track the edge',
      body: 'Every pick is settled against the closing line. Closing line value tells us whether the model is beating the market, which is the only honest measure of edge.',
    },
  ];

  return (
    <section id="how-it-works" className="border-t border-hair bg-elevated px-6 py-24 sm:px-8 sm:py-40">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">How it works</p>
        </Reveal>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {stages.map((stage, i) => (
            <Reveal key={stage.number} delay={i * 0.08}>
              <div className="h-full border border-hair bg-canvas p-6 transition-all duration-300 hover:scale-[1.01] hover:border-strong">
                <span className="tabular font-mono text-[13px] text-ink-faint">{stage.number}</span>
                <h3 className="mt-4 font-serif text-[24px] text-ink">{stage.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">{stage.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutBuild() {
  return (
    <section id="build" className="border-t border-hair bg-canvas px-6 py-24 sm:px-8 sm:py-40">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
        <Reveal>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">The problem</p>
          <p className="mt-4 font-serif text-[21px] italic leading-snug text-ink">
            Most betting tools chase certainty and post 90%+ confidence picks on 1.05 odds. That is losing money in
            slow motion.
          </p>
          <p className="mt-5 text-[16px] leading-relaxed text-ink-secondary">
            APEX is built on one contrarian rule: probability is not edge. Edge is what happens when your
            probability beats the market&apos;s own price. Every pick either passes that gate or it does not exist.
          </p>
        </Reveal>

        <Reveal delay={0.08}>
          <p className="text-[11px] uppercase tracking-wide text-ink-muted">The stack</p>
          <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-secondary">
            <li>Next.js 15, TypeScript, Server Components by default</li>
            <li>Supabase - Postgres, Auth, and row-level security</li>
            <li>Anthropic Claude Sonnet 5, prompt caching, and Message Batches</li>
            <li>Deterministic code for triage, Poisson goals math, and the VALUE GATE</li>
            <li>Free-tier data: API-Football and football-data.org</li>
            <li>Deployed on Vercel</li>
          </ul>
          <div className="mt-6 flex gap-5 text-[13px]">
            <a
              href="https://github.com/Rydny1/apex-ai-analysis"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:brightness-110"
            >
              GitHub repo
            </a>
            <Link href="/about" className="text-accent hover:brightness-110">
              Read the write-up
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HomeFooter() {
  return (
    <footer className="border-t border-hair bg-canvas px-6 py-16 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <Reveal>
              <p className="text-[14px] font-medium tracking-[0.24em] text-ink">A P E X</p>
              <span className="mt-3 block h-px w-[60px] origin-left scale-x-100 bg-accent" aria-hidden="true" />
              <p className="mt-4 text-[13px] text-ink-muted">Pre-match football analysis, priced against the market.</p>
            </Reveal>
          </div>
          <nav className="flex flex-col gap-2 text-[13px] text-ink-secondary">
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#track-record" className="hover:text-ink">
              Track record
            </a>
            <Link href="/about" className="hover:text-ink">
              About
            </Link>
          </nav>
          <div className="flex flex-col gap-2 text-[13px] text-ink-secondary">
            <a href="https://github.com/Rydny1/apex-ai-analysis" target="_blank" rel="noopener noreferrer" className="hover:text-ink">
              GitHub
            </a>
            <span className="text-ink-faint">LinkedIn</span>
            <a href="mailto:hello@apex.local" className="hover:text-ink">
              Email
            </a>
          </div>
        </div>
        <p className="mt-12 text-[11px] text-ink-faint">
          APEX is a personal project by Rydny · Built in Riga · 2026 · Not gambling advice.
        </p>
      </div>
    </footer>
  );
}

function StatBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-hair bg-elevated p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="tabular font-mono mt-1 text-[22px] font-normal text-ink">{value}</div>
    </div>
  );
}
