import { Activity, BarChart3, CheckCircle2, ExternalLink, FileCheck2, LockKeyhole, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useGetAdminSummary, getGetAdminSummaryQueryKey } from '@workspace/api-client-react';
import { ErrorState, PageIntro } from '@/components/wargames-shell';
import { ScoreboardVerifier } from '@/components/scoreboard-verifier';
import { AdminOperations } from '@/components/admin-operations';
import { trackEvent } from '@/lib/analytics';

async function openScoreboard(matchId: string, adminKey: string) {
  const response = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/scoreboard`, {
    headers: { 'x-admin-key': adminKey },
  });
  if (!response.ok) throw new Error('The source scoreboard could not be opened.');
  const blobUrl = URL.createObjectURL(await response.blob());
  window.open(blobUrl, '_blank', 'noopener,noreferrer');
  trackEvent('source_scoreboard_opened', { surface: 'admin_archive' });
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(() => typeof window === 'undefined' ? '' : sessionStorage.getItem('throne-admin-key') ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  const [actor, setActor] = useState(() => typeof window === 'undefined' ? '' : sessionStorage.getItem('throne-admin-actor') ?? '');
  const adminRequest = adminKey ? { headers: { 'x-admin-key': adminKey } } : undefined;
  const summaryQuery = useGetAdminSummary({
    request: adminRequest,
    query: {
      queryKey: [...getGetAdminSummaryQueryKey(), adminKey],
      retry: false,
    },
  });
  const [showCommit, setShowCommit] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [committedMatchId, setCommittedMatchId] = useState<string | null>(null);
  const summary = summaryQuery.data;
  const maxActivity = useMemo(() => Math.max(...(summary?.activity.map((item) => Math.max(item.blue, item.red)) ?? [1]), 1), [summary?.activity]);

  return (
    <div>
      <PageIntro eyebrow="Operations / restricted" title={<>Keep the<br /><span className="text-primary">record honest.</span></>} detail="Operator tools for verified match commits, application review, and visitor telemetry. Public viewing never requires an account; writes do." />
      <section className="mx-auto max-w-[1440px] px-5 pb-20 lg:px-10">
        {summaryQuery.isError ? (
          <div className="ink-panel relative overflow-hidden p-8 sm:p-12" data-testid="status-admin-locked">
            <LockKeyhole size={22} className="relative text-primary" />
            <div className="relative mt-16 max-w-2xl">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">401 / authorization required</div>
              <h2 className="mt-4 font-display text-5xl font-extrabold leading-[0.9] tracking-[-0.06em] sm:text-7xl">This room is<br />for operators.</h2>
              <p className="mt-6 max-w-lg text-sm leading-7 text-slate-300">The public archive remains open. Match commits and application operations are restricted to authorized record keepers on the server.</p>
              <div className="mt-8 flex flex-wrap gap-3"><span className="border border-slate-700 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">Public reads: open</span><span className="border border-primary/45 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-primary">Writes: locked</span></div>
              <form
                className="mt-8 flex max-w-xl flex-col gap-2 sm:flex-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!keyDraft.trim()) return;
                  sessionStorage.setItem('throne-admin-key', keyDraft.trim());
                  setAdminKey(keyDraft.trim());
                  setKeyDraft('');
                }}
              >
                <input
                  type="password"
                  value={keyDraft}
                  onChange={(event) => setKeyDraft(event.target.value)}
                  placeholder="Operator access code"
                  aria-label="Operator access code"
                  className="field-input border-slate-700 bg-slate-950/30 text-slate-100 placeholder:text-slate-500"
                  data-testid="input-admin-key"
                />
                <button type="submit" className="inline-flex items-center justify-center gap-2 border border-primary/60 px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground" data-testid="button-unlock-admin">
                  <ShieldCheck size={15} /> Unlock room
                </button>
              </form>
            </div>
          </div>
        ) : summaryQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="h-32 animate-pulse bg-muted" /><div className="h-32 animate-pulse bg-muted" /><div className="h-32 animate-pulse bg-muted" /><div className="h-32 animate-pulse bg-muted" /></div>
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AdminMetric icon={Users} label="Visitors today" value={summary.visitorsToday.toLocaleString()} />
              <AdminMetric icon={Activity} label="Visitors this week" value={summary.visitorsThisWeek.toLocaleString()} />
              <AdminMetric icon={FileCheck2} label="Application queue" value={summary.applicationQueue.toString()} accent />
              <AdminMetric icon={ShieldCheck} label="OCR confidence" value={summary.ocrConfidence === null ? '—' : `${summary.ocrConfidence.toFixed(1)}%`} />
            </div>
            <label className="mt-8 block max-w-md">
              <span className="field-label">Operator name for audit records</span>
              <input
                list="operator-name-options"
                value={actor}
                onChange={(event) => { setActor(event.target.value); sessionStorage.setItem('throne-admin-actor', event.target.value); }}
                className="field-input mt-2"
                placeholder="Your name or operator handle"
                data-testid="input-admin-actor"
              />
              <datalist id="operator-name-options">
                <option value="Admin" />
                <option value="Suricata" />
              </datalist>
              <span className="mt-2 block text-xs text-muted-foreground">Suggested operators: Admin and Suricata. You can enter another operator name when needed.</span>
            </label>
            <div className="mt-12 grid gap-10 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="border border-border bg-card p-6 sm:p-8">
                <div className="flex items-end justify-between gap-5 border-b border-border pb-5"><div><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Visitor telemetry</div><h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.05em]">Audience signal</h2></div><BarChart3 size={19} className="text-primary" /></div>
                <div className="mt-8 flex h-52 items-end gap-2 sm:gap-3">
                  {summary.activity.map((point) => <div key={point.label} className="flex h-full flex-1 flex-col justify-end gap-2"><div className="flex items-end gap-1" style={{ height: '88%' }}><div className="w-1/2 bg-accent/75 transition-all duration-700" style={{ height: `${Math.max((point.blue / maxActivity) * 100, 5)}%` }} /><div className="w-1/2 bg-primary transition-all duration-700" style={{ height: `${Math.max((point.red / maxActivity) * 100, 5)}%` }} /></div><span className="text-center font-mono text-[9px] uppercase text-muted-foreground">{point.label}</span></div>)}
                </div>
                <div className="mt-5 flex gap-5 border-t border-border pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><span className="flex items-center gap-2"><i className="size-2 bg-accent" /> archive</span><span className="flex items-center gap-2"><i className="size-2 bg-primary" /> applications</span></div>
              </div>
              <div className="ink-panel p-7 sm:p-8">
                <RefreshCw size={19} className="relative text-primary" />
                <h2 className="relative mt-16 font-display text-3xl font-bold leading-none tracking-[-0.04em]">Commit the next<br /><span className="text-primary">verified result.</span></h2>
                <p className="relative mt-5 text-sm leading-7 text-slate-300">Scoreboards are written to the public record only after an authorized operator checks the formation.</p>
                {submitted ? <div className="relative mt-7 border border-primary/35 bg-primary/10 p-3 text-xs text-slate-200" data-testid="status-match-committed"><div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-primary" /> Result and source scoreboard committed to the archive.</div>{committedMatchId ? <button type="button" onClick={() => void openScoreboard(committedMatchId, adminKey)} className="mt-3 inline-flex items-center gap-2 font-bold uppercase tracking-[0.12em] text-primary hover:text-slate-100" data-testid="button-open-source-scoreboard">Open source scoreboard <ExternalLink size={13} /></button> : null}</div> : <button type="button" onClick={() => setShowCommit(true)} data-testid="button-open-commit" className="relative mt-8 inline-flex items-center gap-2 bg-primary px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] text-primary-foreground transition-transform hover:-translate-y-1"><Plus size={15} /> Open commit form</button>}
              </div>
            </div>
            {showCommit ? <div className="mt-8 border border-primary/45 bg-card p-6 sm:p-8" data-testid="panel-commit-match">
              <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Operator action / new match</div><h2 className="mt-3 font-display text-3xl font-bold">Write a verified scoreline.</h2></div><button type="button" onClick={() => setShowCommit(false)} data-testid="button-close-commit" className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground hover:text-primary">Close panel</button></div>
              <ScoreboardVerifier
                actor={actor}
                adminRequest={adminRequest as { headers: { 'x-admin-key': string } }}
                onCommitted={(matchId, participantCount) => {
                  trackEvent('verified_match_committed', {
                    participant_count: participantCount,
                    has_source_scoreboard: true,
                  });
                  setCommittedMatchId(matchId);
                  setSubmitted(true);
                  setShowCommit(false);
                }}
              />
            </div> : null}
            <AdminOperations actor={actor} adminRequest={adminRequest as { headers: { 'x-admin-key': string } }} />
          </>
        ) : <ErrorState message="No operator summary is available." />}
      </section>
    </div>
  );
}

function AdminMetric({ icon: Icon, label, value, accent = false }: { icon: typeof Users; label: string; value: string; accent?: boolean }) {
  return <div className={`data-card p-5 ${accent ? 'border-primary/50' : ''}`}><Icon size={17} className="text-primary" /><div className="mt-7 font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{label}</div><div className="mt-2 font-display text-3xl font-extrabold tracking-[-0.05em]" data-testid={`admin-metric-${label.toLowerCase().replaceAll(' ', '-')}`}>{value}</div></div>;
}