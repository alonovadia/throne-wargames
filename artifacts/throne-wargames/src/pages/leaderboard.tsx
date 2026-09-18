import { ArrowUpRight, BarChart3, Medal, TrendingUp } from 'lucide-react';
import { Link } from 'wouter';
import { useState } from 'react';
import { useGetLeaderboards } from '@workspace/api-client-react';
import { EmptyState, ErrorState, formatWeapon, PageIntro, SkeletonRows } from '@/components/wargames-shell';

type RankingMode = 'players' | 'classes';

export default function LeaderboardPage() {
  const [mode, setMode] = useState<RankingMode>('players');
  const query = useGetLeaderboards();
  const data = query.data;
  const players = [...(data?.players ?? [])].sort((a, b) => b.winRate - a.winRate || b.avgDamage - a.avgDamage);
  const classes = [...(data?.classes ?? [])].sort((a, b) => b.winRate - a.winRate || b.avgDamage - a.avgDamage);

  return (
    <div>
      <PageIntro
        eyebrow="Rankings / season 01"
        title={<>The names behind<br /><span className="text-primary">the numbers.</span></>}
        detail="Public benchmarks from verified large-team records. Sort the field by consistency, pressure, and the weapon pair that keeps showing up when the stakes rise."
        action={<Link href="/players" data-testid="link-rankings-directory" className="inline-flex items-center gap-2 border border-border bg-card px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] transition-colors hover:border-primary hover:text-primary">Player directory <ArrowUpRight size={15} /></Link>}
      />
      <section className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10">
        <div className="mb-8 flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 bg-muted p-1">
            {(['players', 'classes'] as RankingMode[]).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} data-testid={`button-ranking-${item}`} className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[0.13em] transition-colors ${mode === item ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                {item === 'players' ? 'Player index' : 'Class benchmarks'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground"><TrendingUp size={14} className="text-primary" /> ranked by win rate / damage tiebreak</div>
        </div>
        {query.isError ? <ErrorState message="Leaderboard telemetry could not be loaded." /> : query.isLoading ? <SkeletonRows count={7} /> : mode === 'players' ? (
          players.length ? (
            <div className="overflow-hidden border border-border bg-card">
              <div className="hidden grid-cols-[72px_1.5fr_1fr_0.7fr_0.7fr_0.8fr_0.8fr] gap-4 border-b border-border bg-muted/45 px-5 py-3 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground md:grid">
                <span>Rank</span><span>Player</span><span>Archetype</span><span>Matches</span><span>Wins</span><span>Win rate</span><span>Avg damage</span>
              </div>
              {players.map((player, index) => (
                <Link href={`/players/${player.id}`} key={player.id} data-testid={`row-ranked-player-${player.id}`} className="grid grid-cols-[42px_1fr_auto] items-center gap-4 border-b border-border px-5 py-5 transition-colors last:border-b-0 hover:bg-primary/5 md:grid-cols-[72px_1.5fr_1fr_0.7fr_0.7fr_0.8fr_0.8fr] md:gap-4">
                  <div className="font-display text-2xl font-bold text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="flex items-center gap-2 font-display text-lg font-bold">{player.characterName}{index < 3 ? <Medal size={14} className={index === 0 ? 'text-primary' : 'text-muted-foreground'} /> : null}</div>
                    <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{player.form || 'stable form'}</div>
                  </div>
                  <div className="hidden text-sm text-muted-foreground md:block">{player.archetype}</div>
                  <div className="hidden font-mono text-sm md:block">{player.matches}</div>
                  <div className="hidden font-mono text-sm md:block">{player.wins}</div>
                  <div className="font-mono text-sm font-bold text-primary">{player.winRate.toFixed(1)}%</div>
                  <div className="hidden font-mono text-sm md:block">{Math.round(player.avgDamage).toLocaleString()}</div>
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No player records yet." detail="The first verified match will establish the opening names in the index." />
        ) : (
          classes.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {classes.map((item, index) => (
                <article key={item.id} data-testid={`card-class-${item.id}`} className="data-card p-6">
                  <div className="flex items-start justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <span className="font-display text-3xl font-bold text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <h2 className="font-display text-xl font-bold">{formatWeapon(item.mainWeapon)} <span className="text-muted-foreground">/</span> {formatWeapon(item.offWeapon)}</h2>
                        <div className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><BarChart3 size={12} className="text-primary" /> {item.totalMatches} verified matches</div>
                      </div>
                    </div>
                    <div className="text-right font-mono text-2xl font-bold text-primary">{item.winRate.toFixed(1)}%</div>
                  </div>
                  <div className="mt-7 grid grid-cols-3 gap-3 border-t border-border pt-4 text-xs">
                    <div><div className="font-mono text-[9px] uppercase text-muted-foreground">Kills</div><div className="mt-1 font-bold">{item.avgKills.toFixed(1)}</div></div>
                    <div><div className="font-mono text-[9px] uppercase text-muted-foreground">Damage</div><div className="mt-1 font-bold">{Math.round(item.avgDamage).toLocaleString()}</div></div>
                    <div><div className="font-mono text-[9px] uppercase text-muted-foreground">Trend</div><div className={`mt-1 font-bold ${item.trend >= 0 ? 'text-primary' : 'text-destructive'}`}>{item.trend >= 0 ? '+' : ''}{item.trend.toFixed(1)}%</div></div>
                  </div>
                </article>
              ))}
            </div>
          ) : <EmptyState title="No class benchmarks yet." detail="Weapon pairs will surface here after the first verified records are committed." />
        )}
      </section>
    </div>
  );
}