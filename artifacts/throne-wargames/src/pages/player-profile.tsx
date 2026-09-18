import { ArrowLeft, BarChart3, Crosshair, HeartPulse, ShieldCheck, Swords, Trophy } from 'lucide-react';
import { Link, useParams } from 'wouter';
import { useGetPlayer } from '@workspace/api-client-react';
import { ErrorState, formatDate, formatWeapon, MetricCard, PageIntro, SkeletonRows } from '@/components/wargames-shell';

export default function PlayerProfilePage() {
  const params = useParams<{ playerId: string }>();
  const playerQuery = useGetPlayer(params.playerId);
  const player = playerQuery.data;

  if (playerQuery.isLoading) {
    return <><PageIntro eyebrow="Player dossier / loading" title={<>Reading the<br /><span className="text-primary">record.</span></>} detail="Calling the verified match archive." /><div className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10"><SkeletonRows count={4} /></div></>;
  }

  if (playerQuery.isError || !player) {
    return <><PageIntro eyebrow="Player dossier / unavailable" title={<>Record<br /><span className="text-primary">unresolved.</span></>} detail="This player profile could not be found in the public archive." /><div className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10"><ErrorState message="Check the profile link and try again." /></div></>;
  }

  return (
    <div>
      <PageIntro eyebrow={`Player dossier / ${player.archetype}`} title={<>{player.characterName}<br /><span className="text-primary">{player.form || 'in form'}.</span></>} detail="A public performance profile assembled from verified six-versus-six records. Numbers are averages unless marked otherwise." action={<Link href="/players" data-testid="link-back-players" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.13em] text-muted-foreground transition-colors hover:text-primary"><ArrowLeft size={15} /> All players</Link>} />
      <section className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Win rate" value={`${player.winRate.toFixed(1)}%`} detail={`${player.wins} wins / ${player.matches} matches`} accent />
          <MetricCard label="Avg kills" value={player.avgKills.toFixed(1)} detail="per verified match" />
          <MetricCard label="Avg damage" value={Math.round(player.avgDamage).toLocaleString()} detail="pressure dealt" />
          <MetricCard label="Avg healing" value={Math.round(player.avgHealing).toLocaleString()} detail="sustain restored" />
        </div>

        <div className="mt-12 grid gap-12 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className="flex items-end justify-between border-b border-border pb-4">
              <div><div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Performance ledger</div><h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.05em]">Personal records</h2></div>
              <Trophy size={20} className="text-primary" />
            </div>
            {player.records.length ? <div className="mt-3 divide-y divide-border border-b border-border">
              {player.records.map((record) => (
                <div key={`${record.label}-${record.achievedAt}`} data-testid={`record-${record.label.toLowerCase().replaceAll(' ', '-')}`} className="flex items-center justify-between gap-4 py-5">
                  <div><div className="font-display text-lg font-bold">{record.label}</div><div className="mt-1 font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{formatDate(record.achievedAt)}</div></div>
                  <div className="font-display text-3xl font-extrabold text-primary">{record.value.toLocaleString()}</div>
                </div>
              ))}
            </div> : <div className="mt-4"><p className="text-sm text-muted-foreground">The record book is still blank.</p></div>}
          </div>
          <div>
            <div className="border-b border-border pb-4"><div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Weapon signature</div><h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.05em]">Pairs that define play.</h2></div>
            <div className="mt-5 space-y-3">
              {player.weaponBreakdown.map((item) => (
                <div key={item.id} data-testid={`weapon-breakdown-${item.id}`} className="border border-border bg-card p-4 transition-colors hover:border-primary/50">
                  <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 font-bold"><Swords size={15} className="text-primary" /> {formatWeapon(item.mainWeapon)} <span className="text-muted-foreground">+</span> {formatWeapon(item.offWeapon)}</div><span className="font-mono text-xs text-primary">{item.winRate.toFixed(1)}%</span></div>
                  <div className="mt-4 h-1.5 bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(item.winRate, 100)}%` }} /></div>
                  <div className="mt-3 flex justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground"><span>{item.totalMatches} matches</span><span>{item.avgKills.toFixed(1)} avg kills</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-14 grid gap-3 border-t border-border pt-5 sm:grid-cols-3">
          {[
            { icon: Crosshair, label: 'avg assists', value: player.avgAssists.toFixed(1) },
            { icon: HeartPulse, label: 'avg healing', value: Math.round(player.avgHealing).toLocaleString() },
            { icon: ShieldCheck, label: 'verified matches', value: player.matches.toString() },
          ].map(({ icon: Icon, label, value }) => <div key={label} className="flex items-center gap-4 py-3"><Icon size={18} className="text-primary" /><div><div className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{label}</div><div className="mt-1 font-display text-xl font-bold">{value}</div></div></div>)}
        </div>
      </section>
    </div>
  );
}