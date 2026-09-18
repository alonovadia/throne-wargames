import { ArrowDownRight, ArrowUpRight, Clock3, Crosshair, ShieldCheck, Trophy } from 'lucide-react';
import { Link } from 'wouter';
import { useGetOverview } from '@workspace/api-client-react';
import { ErrorState, formatDate, MetricCard, SectionLabel, SkeletonRows } from '@/components/wargames-shell';

export default function HomePage() {
  const overviewQuery = useGetOverview();
  const overview = overviewQuery.data;

  return (
    <div>
      <section className="ink-panel hero-grid relative">
        <div className="relative mx-auto grid max-w-[1440px] gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.12fr_0.88fr] lg:gap-20 lg:px-10 lg:pb-28 lg:pt-28">
          <div className="reveal self-end">
            <div className="mb-7 flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
              <span className="live-mark size-2 rounded-full bg-primary" />
              Public competitive record · season 01
            </div>
            <h1 className="max-w-4xl font-display text-6xl font-extrabold leading-[0.84] tracking-[-0.07em] sm:text-8xl lg:text-[9.3rem]">
              Every clash<br /><span className="text-primary">leaves a mark.</span>
            </h1>
            <p className="mt-8 max-w-lg text-base leading-7 text-slate-300 sm:text-lg">
              Throne &amp; Liberty&apos;s ranked wargames, held in public. Verified large-team records, weapon benchmarks, and the players who turn a formation into a story.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link href="/matches" data-testid="link-hero-matches" className="group inline-flex items-center gap-3 bg-primary px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-primary-foreground transition-transform hover:-translate-y-1">
                Read the archive <ArrowUpRight size={16} className="transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
              </Link>
              <Link href="/apply" data-testid="link-hero-apply" className="inline-flex items-center gap-3 border border-slate-600 px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-slate-200 transition-colors hover:border-primary hover:text-primary">
                Apply your roster
              </Link>
            </div>
          </div>
          <div className="reveal reveal-delay-2 relative flex min-h-[330px] items-end justify-end lg:min-h-[510px]">
            <div className="absolute right-0 top-0 h-52 w-52 border border-primary/30 sm:h-72 sm:w-72 lg:h-96 lg:w-96">
              <div className="absolute -left-4 -top-4 size-8 border-l-2 border-t-2 border-primary" />
              <div className="absolute -bottom-4 -right-4 size-8 border-b-2 border-r-2 border-primary" />
              <div className="absolute inset-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_0_12px_hsl(28_91%_56%_/_0.12)]" />
              <div className="absolute left-1/2 top-0 h-full w-px bg-primary/20" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-primary/20" />
              <span className="absolute -right-1 -top-7 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">field / 06</span>
            </div>
            <div className="relative z-10 w-full max-w-[340px] border border-slate-600 bg-slate-900/85 p-5 backdrop-blur-sm">
              <div className="flex items-center justify-between border-b border-slate-700 pb-4">
                <span className="font-mono text-[9px] uppercase tracking-[0.17em] text-slate-400">Latest verified result</span>
                <ShieldCheck size={15} className="text-primary" />
              </div>
              {overviewQuery.isLoading ? <div className="mt-5 h-32 animate-pulse bg-slate-800" /> : overviewQuery.isError ? <p className="py-8 text-sm text-slate-400">Match telemetry offline.</p> : overview?.latestMatch ? (
                <div className="mt-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <div className="font-display text-3xl font-bold">{overview.latestMatch.winningTeam === 'BLUE' ? 'BLUE' : 'RED'} <span className="text-primary">VICTOR</span></div>
                      <div className="mt-1 font-mono text-[10px] uppercase text-slate-400">{formatDate(overview.latestMatch.matchDate)}</div>
                    </div>
                    <div className="font-mono text-2xl text-slate-200">{overview.latestMatch.blueScore}<span className="px-1 text-slate-500">:</span>{overview.latestMatch.redScore}</div>
                  </div>
                  <p className="mt-5 border-l border-primary pl-3 text-xs leading-5 text-slate-300">{overview.latestMatch.note || 'A measured exchange on the field.'}</p>
                </div>
              ) : <p className="py-8 text-sm leading-6 text-slate-400">No verified matches have entered the archive yet.</p>}
            </div>
          </div>
        </div>
        <div className="relative mx-auto flex max-w-[1440px] items-center gap-4 px-5 pb-7 font-mono text-[10px] uppercase tracking-[0.17em] text-slate-500 lg:px-10">
          <ArrowDownRight size={14} className="text-primary" /> scroll to inspect the record
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[0.68fr_1.32fr]">
          <div className="reveal">
            <SectionLabel>Why this exists</SectionLabel>
            <h2 className="mt-5 max-w-sm font-display text-4xl font-bold leading-[0.98] tracking-[-0.05em] sm:text-5xl">A scoreboard is not a story.</h2>
            <p className="mt-6 max-w-sm text-sm leading-7 text-muted-foreground">The archive turns a result into a record you can inspect: who held the line, which weapon set carried the pressure, and where momentum moved.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: ShieldCheck, title: 'Verified', copy: 'Only committed match records enter the chronicle.' },
              { icon: Crosshair, title: 'Precise', copy: 'Benchmarks read the detail behind the victory.' },
              { icon: Trophy, title: 'Shareable', copy: 'Give your roster a result worth remembering.' },
            ].map(({ icon: Icon, title, copy }, index) => (
              <div key={title} className={`data-card reveal reveal-delay-${index + 1} p-5`}>
                <Icon size={20} className="text-primary" />
                <h3 className="mt-12 font-display text-xl font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-card/45">
        <div className="mx-auto max-w-[1440px] px-5 py-14 lg:px-10 lg:py-20">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <SectionLabel>Signal from the field</SectionLabel>
              <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.05em]">The season, in motion.</h2>
            </div>
            <Link href="/leaderboard" data-testid="link-home-rankings" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-primary transition-transform hover:translate-x-1">Open rankings <ArrowUpRight size={15} /></Link>
          </div>
          {overviewQuery.isError ? <div className="mt-8"><ErrorState message="Overview telemetry is unavailable right now." /></div> : overviewQuery.isLoading ? <div className="mt-8"><SkeletonRows count={1} /></div> : overview ? (
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Verified matches" value={overview.totalMatches.toLocaleString()} detail="entered into the record" accent />
              <MetricCard label="Recognized players" value={overview.totalPlayers.toLocaleString()} detail="with a public profile" />
              <MetricCard label="Active applications" value={overview.activeApplications.toLocaleString()} detail="rosters in review" />
              <MetricCard label="Average match" value={overview.averageMatchLength === null ? '—' : `${overview.averageMatchLength}m`} detail={overview.averageMatchLength === null ? 'duration not recorded yet' : 'from first engage to final bell'} />
            </div>
          ) : null}
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-5 py-16 lg:px-10 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_0.72fr]">
          <div>
            <SectionLabel>Momentum log</SectionLabel>
            <h2 className="mt-5 font-display text-4xl font-bold tracking-[-0.05em]">Where the fight turned.</h2>
            <div className="mt-9 border-t border-border">
              {overviewQuery.isLoading ? <SkeletonRows count={4} /> : overview?.momentum.length ? overview.momentum.map((point, index) => {
                const total = point.blue + point.red || 1;
                const blueWidth = (point.blue / total) * 100;
                return (
                  <div key={point.label} className="reveal flex items-center gap-4 border-b border-border py-4" style={{ animationDelay: `${index * 80}ms` }}>
                    <span className="w-16 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{point.label}</span>
                    <div className="flex h-2 flex-1 overflow-hidden bg-muted">
                      <div className="bg-accent transition-all duration-700" style={{ width: `${blueWidth}%` }} />
                      <div className="bg-primary transition-all duration-700" style={{ width: `${100 - blueWidth}%` }} />
                    </div>
                    <span className="w-16 text-right font-mono text-[10px] text-muted-foreground">{point.blue} — {point.red}</span>
                  </div>
                );
              }) : <p className="border-b border-border py-8 text-sm text-muted-foreground">Momentum will appear after verified matches are recorded.</p>}
            </div>
          </div>
          <div className="ink-panel p-7 sm:p-9">
            <div className="relative">
              <Clock3 size={20} className="text-primary" />
              <h3 className="mt-16 font-display text-3xl font-bold leading-none tracking-[-0.04em]">Not just who won.<br /><span className="text-primary">How.</span></h3>
              <p className="mt-5 text-sm leading-7 text-slate-300">Every verified match preserves the detail that usually disappears when the lobby closes.</p>
              <Link href="/matches" data-testid="link-home-archive" className="mt-8 inline-flex items-center gap-2 border-b border-primary pb-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">Browse every match <ArrowUpRight size={14} /></Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}