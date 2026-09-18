import { Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useGetPlayers } from '@workspace/api-client-react';
import { EmptyState, ErrorState, PageIntro, SkeletonRows } from '@/components/wargames-shell';

export default function PlayersPage() {
  const [search, setSearch] = useState('');
  const query = useGetPlayers({ limit: 100 });
  const players = useMemo(() => {
    const all = query.data ?? [];
    const needle = search.toLowerCase().trim();
    return needle ? all.filter((player) => `${player.characterName} ${player.archetype}`.toLowerCase().includes(needle)) : all;
  }, [query.data, search]);

  return (
    <div>
      <PageIntro eyebrow="Players / public directory" title={<>Find the<br /><span className="text-primary">decisive six.</span></>} detail="Every player profile is a living snapshot of the matches they have left on the field. Search a character, compare their form, then follow the record into the archive." />
      <section className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 border-y border-border py-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex w-full max-w-md items-center gap-3 border border-border bg-card px-4 py-3 transition-colors focus-within:border-primary">
            <Search size={16} className="text-primary" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} data-testid="input-player-search" placeholder="Search player or archetype" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
          </label>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground"><SlidersHorizontal size={14} /> {players.length} shown</div>
        </div>
        {query.isError ? <ErrorState message="The player directory could not be loaded." /> : query.isLoading ? <SkeletonRows count={8} /> : players.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((player, index) => (
              <Link href={`/players/${player.id}`} key={player.id} data-testid={`card-player-${player.id}`} className="data-card group p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="grid size-11 place-items-center border border-primary/45 bg-primary/10 font-display text-xl font-bold text-primary">{player.characterName.slice(0, 1).toUpperCase()}</div>
                  <span className="font-mono text-[10px] text-muted-foreground">#{String(index + 1).padStart(2, '0')}</span>
                </div>
                <h2 className="mt-8 font-display text-2xl font-bold tracking-[-0.04em] group-hover:text-primary">{player.characterName}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{player.archetype}</p>
                <div className="mt-7 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <div><div className="font-mono text-[9px] uppercase text-muted-foreground">Win rate</div><div className="mt-1 font-display text-lg font-bold text-primary">{player.winRate.toFixed(1)}%</div></div>
                  <div><div className="font-mono text-[9px] uppercase text-muted-foreground">Matches</div><div className="mt-1 font-display text-lg font-bold">{player.matches}</div></div>
                  <div><div className="font-mono text-[9px] uppercase text-muted-foreground">Form</div><div className="mt-1 truncate text-xs font-bold">{player.form || '—'}</div></div>
                </div>
              </Link>
            ))}
          </div>
        ) : <EmptyState title="No player in that fog." detail="Try a different character name or clear the search to return to the full directory." />
        }
      </section>
    </div>
  );
}