import { ChevronDown, ChevronUp, Clock3, ExternalLink, ShieldCheck, Swords } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'wouter';
import { TeamColor, useGetMatches } from '@workspace/api-client-react';
import { EmptyState, ErrorState, formatDate, formatWeapon, PageIntro, SkeletonRows } from '@/components/wargames-shell';
import { trackEvent } from '@/lib/analytics';

async function openScoreboard(matchId: string, adminKey: string) {
  const response = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/scoreboard`, {
    headers: { 'x-admin-key': adminKey },
  });
  if (!response.ok) throw new Error('The source scoreboard could not be opened.');
  const blobUrl = URL.createObjectURL(await response.blob());
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  trackEvent('source_scoreboard_opened', { surface: 'match_archive' });
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export default function MatchesPage() {
  const query = useGetMatches({ limit: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const adminKey = typeof window === 'undefined' ? '' : sessionStorage.getItem('throne-admin-key') ?? '';
  const matches = query.data ?? [];

  return (
    <div>
      <PageIntro eyebrow="Match archive / verified" title={<>The fights<br /><span className="text-primary">that stayed.</span></>} detail="A chronological record of completed two-team wargames with up to 48 players per side. Open any result to inspect the participants, weapon pairs, and the detail beneath the score." action={<div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground"><ShieldCheck size={15} className="text-primary" /> operator verified</div>} />
      <section className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10">
        {query.isError ? <ErrorState message="The match archive could not be reached." /> : query.isLoading ? <SkeletonRows count={7} /> : matches.length ? (
          <div className="space-y-3">
            {matches.map((match, index) => {
              const isOpen = openId === match.id;
              const teams = [...new Set(match.participants.map((participant) => participant.team))];
              const scoreFor = (team: TeamColor) => team === TeamColor.BLUE ? match.blueScore : team === TeamColor.RED ? match.redScore : match.yellowScore;
              const teamLabel = (team: TeamColor) => team[0] + team.slice(1).toLowerCase();
              return (
                <article key={match.id} data-testid={`card-match-${match.id}`} className={`border bg-card transition-colors ${isOpen ? 'border-primary/55' : 'border-border hover:border-primary/35'}`}>
                   <button type="button" onClick={() => {
                     setOpenId(isOpen ? null : match.id);
                     if (!isOpen) {
                       trackEvent('match_details_expanded', {
                         participant_count: match.participants.length,
                         winning_team: match.winningTeam,
                       });
                     }
                   }} data-testid={`button-expand-match-${match.id}`} className="grid w-full grid-cols-[34px_1fr_auto] items-center gap-4 px-5 py-5 text-left md:grid-cols-[60px_1.2fr_0.8fr_0.55fr_0.55fr_40px]">
                    <span className="font-display text-xl font-bold text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                     <div><div className="flex items-center gap-2 font-display text-xl font-bold">{teamLabel(match.winningTeam)} victory <span className="inline-flex items-center gap-1 font-mono text-[9px] font-normal uppercase tracking-[0.1em] text-primary"><ShieldCheck size={11} /> verified</span></div><div className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{formatDate(match.matchDate)}</div></div>
                     <div className="hidden text-right font-mono text-xs text-muted-foreground md:block">{teams.map((team, teamIndex) => <span key={team}>{teamIndex ? <span className="px-1">:</span> : null}{scoreFor(team)}</span>)}</div>
                     <div className="hidden items-center gap-1 text-xs text-muted-foreground md:flex"><Clock3 size={13} /> {teams.map((team) => match.participants.filter((participant) => participant.team === team).length).join('v')}</div>
                    <div className="hidden font-mono text-[10px] uppercase text-muted-foreground md:block">{match.participants.length} players</div>
                    <span className="text-muted-foreground">{isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}</span>
                  </button>
                  {isOpen ? (
                    <div className="border-t border-border bg-muted/20 px-5 pb-6 pt-5">
                       <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="max-w-xl text-sm leading-6 text-muted-foreground">{match.note || 'No field note was attached to this result.'}</p>{adminKey && match.hasScreenshot ? <button type="button" onClick={() => void openScoreboard(match.id, adminKey)} className="mt-3 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary hover:text-foreground" data-testid={`button-open-scoreboard-${match.id}`}>Open source scoreboard <ExternalLink size={12} /></button> : null}</div><div className="font-mono text-xs">{teams.map((team, teamIndex) => <span key={team}>{teamIndex ? <span className="mx-2 text-muted-foreground">/</span> : null}<span>{scoreFor(team)}</span> <span className="text-muted-foreground">{teamLabel(team).toLowerCase()}</span></span>)}</div></div>
                      <div className="mt-6 grid gap-5 md:grid-cols-2">
                        {teams.map((team) => (
                          <div key={team}>
                            <div className={`mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.15em] ${team === TeamColor.BLUE ? 'text-accent' : team === TeamColor.YELLOW ? 'text-yellow-500' : 'text-primary'}`}><span className={`size-2 ${team === TeamColor.BLUE ? 'bg-accent' : team === TeamColor.YELLOW ? 'bg-yellow-500' : 'bg-primary'}`} /> {teamLabel(team)} formation</div>
                            <div className="divide-y divide-border border-y border-border">
                              {match.participants.filter((participant) => participant.team === team).map((participant) => (
                                <Link href={`/players/${participant.playerId}`} key={participant.playerId} data-testid={`link-match-player-${participant.playerId}`} className="flex items-center justify-between gap-3 py-3 text-sm transition-colors hover:text-primary">
                                  <div><div className="font-bold">{participant.characterName}</div><div className="mt-1 flex items-center gap-1 font-mono text-[9px] uppercase text-muted-foreground"><Swords size={10} /> {formatWeapon(participant.mainWeapon)} + {formatWeapon(participant.offWeapon)}</div></div>
                                  <div className="text-right font-mono text-[10px] text-muted-foreground"><span className="text-foreground">{participant.kills}</span> k / {participant.assists} a</div>
                                </Link>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : <EmptyState title="No completed fights yet." detail="Once an operator verifies the first scoreline, it will appear here as the opening entry in the chronicle." />}
      </section>
    </div>
  );
}