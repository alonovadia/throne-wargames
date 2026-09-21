import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AdminMatchStatus,
  ApplicationStatus,
  ApplicationStatusUpdateStatus,
  getGetAdminApplicationsQueryKey,
  getGetAdminMatchesQueryKey,
  getGetAdminSummaryQueryKey,
  getGetMatchesQueryKey,
  TeamColor,
  useCorrectMatch,
  useDiscardMatch,
  useGetAdminApplications,
  useGetAdminMatches,
  useGetClasses,
  useGetAdminClasses,
  useCreateClass,
  useUpdateClass,
  useDeleteClass,
  getGetAdminClassesQueryKey,
  useRestoreMatch,
  useUpdateApplicationStatus,
} from '@workspace/api-client-react';
import type { AdminMatch, MatchCorrection } from '@workspace/api-client-react';
import { Check, ExternalLink, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { instantToLocalDateTime, localDateTimeToInstant } from '@/lib/admin-date-time';

type AdminRequest = { headers: { 'x-admin-key': string } };

const label = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
async function openScoreboard(matchId: string, adminRequest: AdminRequest) {
  const response = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/scoreboard`, { headers: adminRequest.headers });
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function AdminOperations({ adminRequest, actor }: { adminRequest: AdminRequest; actor: string }) {
  const queryClient = useQueryClient();
  const applications = useGetAdminApplications({ request: adminRequest, query: { queryKey: [...getGetAdminApplicationsQueryKey(), adminRequest.headers['x-admin-key']], retry: false } });
  const matches = useGetAdminMatches({ request: adminRequest, query: { queryKey: [...getGetAdminMatchesQueryKey(), adminRequest.headers['x-admin-key']], retry: false } });
  const classes = useGetClasses();
  const catalog = useGetAdminClasses({ request: adminRequest, query: { queryKey: [...getGetAdminClassesQueryKey(), adminRequest.headers['x-admin-key']], retry: false } });
  const createClass = useCreateClass({ request: adminRequest });
  const updateClass = useUpdateClass({ request: adminRequest });
  const deleteClass = useDeleteClass({ request: adminRequest });
  const review = useUpdateApplicationStatus({ request: adminRequest });
  const discard = useDiscardMatch({ request: adminRequest });
  const restore = useRestoreMatch({ request: adminRequest });
  const [editing, setEditing] = useState<AdminMatch | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getGetAdminApplicationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminMatchesQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetMatchesQueryKey({ limit: 50 }) });
  };

  const reviewApplication = (applicationId: string, status: ApplicationStatusUpdateStatus) => {
    if (!actor.trim()) return;
    const reason = window.prompt(`Reason for ${status.toLowerCase()}?`);
    if (!reason?.trim()) return;
    review.mutate({ applicationId, data: { status, actor, reason } }, { onSuccess: refresh });
  };

  const discardMatch = (matchId: string) => {
    if (!actor.trim()) return;
    const reason = window.prompt('Why should this match be removed from public results?');
    if (!reason?.trim()) return;
    if (!window.confirm('Discard this match? Its record and audit history will be retained.')) return;
    discard.mutate({ matchId, data: { actor, reason } }, { onSuccess: refresh });
  };

  const restoreMatch = (matchId: string) => {
    if (!actor.trim()) return;
    const reason = window.prompt('Why should this match be restored to public results and rankings?');
    if (!reason?.trim()) return;
    if (!window.confirm('Restore this match to public results and rankings?')) return;
    restore.mutate({ matchId, data: { actor, reason } }, { onSuccess: refresh });
  };

  return (
    <div className="mt-12 space-y-12">
      <ClassCatalog entries={catalog.data ?? []} actor={actor} onRefresh={() => void queryClient.invalidateQueries({ queryKey: getGetAdminClassesQueryKey() })} createClass={createClass} updateClass={updateClass} deleteClass={deleteClass} />
      <section>
        <div className="border-b border-border pb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Roster operations</div>
          <h2 className="mt-2 font-display text-3xl font-bold">Application review</h2>
        </div>
        {applications.isLoading ? <div className="mt-5 h-36 animate-pulse bg-muted" /> : applications.data?.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {applications.data.map((application) => (
              <article key={application.id} className="border border-border bg-card p-5" data-testid={`application-${application.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="font-display text-2xl font-bold">{application.groupName}</h3><p className="mt-1 text-xs text-muted-foreground">{application.captainName} · {application.captainContact}</p></div>
                  <span className="border border-primary/40 px-2 py-1 font-mono text-[9px] text-primary">{application.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {application.members.map((member) => <div key={member.playerId} className="bg-muted/45 p-2"><b>{member.characterName}</b><div className="mt-1 text-[10px] text-muted-foreground">{label(member.mainWeapon)} / {label(member.offWeapon)}</div></div>)}
                </div>
                {application.notes ? <p className="mt-4 border-l-2 border-primary/50 pl-3 text-xs leading-5 text-muted-foreground">{application.notes}</p> : null}
                {application.status === ApplicationStatus.PENDING ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    <ActionButton onClick={() => reviewApplication(application.id, ApplicationStatusUpdateStatus.APPROVED)} disabled={!actor || review.isPending}><Check size={13} /> Approve</ActionButton>
                    <ActionButton onClick={() => reviewApplication(application.id, ApplicationStatusUpdateStatus.REJECTED)} disabled={!actor || review.isPending}><X size={13} /> Reject</ActionButton>
                    <ActionButton onClick={() => reviewApplication(application.id, ApplicationStatusUpdateStatus.CANCELLED)} disabled={!actor || review.isPending}>Cancel</ActionButton>
                  </div>
                ) : null}
                <AuditTrail records={application.audit} />
              </article>
            ))}
          </div>
        ) : <p className="mt-5 text-sm text-muted-foreground">No roster applications have been submitted.</p>}
      </section>

      <section>
        <div className="border-b border-border pb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Archive operations</div>
          <h2 className="mt-2 font-display text-3xl font-bold">Correct verified records</h2>
        </div>
        {matches.isLoading ? <div className="mt-5 h-36 animate-pulse bg-muted" /> : matches.data?.length ? (
          <div className="mt-5 space-y-4">
            {matches.data.map((match) => (
              <article key={match.id} className={`border bg-card p-5 ${match.status === AdminMatchStatus.DISCARDED ? 'border-destructive/45 opacity-75' : 'border-border'}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h3 className="font-display text-xl font-bold">{new Date(match.matchDate).toLocaleString()} · {match.winningTeam} won</h3><p className="mt-1 text-xs text-muted-foreground">Blue {match.blueScore} / Red {match.redScore} · {match.status}</p></div>
                  <div className="flex gap-2">
                    {match.hasScreenshot ? <button type="button" onClick={() => void openScoreboard(match.id, adminRequest)} className="border border-border p-2 text-muted-foreground hover:text-primary" title="Source scoreboard"><ExternalLink size={15} /></button> : null}
                    {match.status === AdminMatchStatus.COMPLETED ? <><button onClick={() => setEditing(match)} disabled={!actor} className="border border-border p-2 hover:text-primary disabled:opacity-40" title="Correct match"><Pencil size={15} /></button><button onClick={() => discardMatch(match.id)} disabled={!actor || discard.isPending} className="border border-destructive/40 p-2 text-destructive disabled:opacity-40" title="Discard match"><Trash2 size={15} /></button></> : <button onClick={() => restoreMatch(match.id)} disabled={!actor || restore.isPending} className="border border-primary/40 p-2 text-primary disabled:opacity-40" title="Restore match"><RotateCcw size={15} /></button>}
                  </div>
                </div>
                <AuditTrail records={match.audit} />
              </article>
            ))}
          </div>
        ) : <p className="mt-5 text-sm text-muted-foreground">No archive matches exist yet.</p>}
      </section>
       {editing ? <MatchEditor classes={classes.data ?? []} match={editing} actor={actor} adminRequest={adminRequest} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} /> : null}
    </div>
  );
}

function ClassCatalog({ entries, actor, onRefresh, createClass, updateClass, deleteClass }: { entries: Array<{ key: string; displayName: string; aliases: string[]; active: boolean; sortOrder: number }>; actor: string; onRefresh: () => void; createClass: ReturnType<typeof useCreateClass>; updateClass: ReturnType<typeof useUpdateClass>; deleteClass: ReturnType<typeof useDeleteClass> }) {
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [error, setError] = useState('');
  const reason = () => window.prompt('Reason for this catalog change?')?.trim() || '';
  const add = () => {
    setError('');
    if (actor.trim().length < 2) {
      setError('Enter your operator name above before changing the class catalog.');
      return;
    }
    if (!name.trim()) {
      setError('Enter the class display name.');
      return;
    }
    if (!/^[A-Z0-9][A-Z0-9_-]*$/.test(key)) {
      setError('Enter a class key using uppercase letters, numbers, underscores, or hyphens.');
      return;
    }
    const why = reason();
    if (!why) return;
    createClass.mutate({ data: { key, displayName: name.trim(), aliases: aliases.split(',').map((value) => value.trim()).filter(Boolean), actor: actor.trim(), reason: why } }, { onSuccess: () => { setKey(''); setName(''); setAliases(''); onRefresh(); }, onError: (err) => setError(err instanceof Error ? err.message : 'Catalog change failed') });
  };
  const toggle = (entry: typeof entries[number]) => {
    const why = reason(); if (!why || !actor.trim()) return;
    updateClass.mutate({ classKey: entry.key, data: { active: !entry.active, actor, reason: why } }, { onSuccess: onRefresh, onError: (err) => setError(err instanceof Error ? err.message : 'Catalog change failed') });
  };
  const edit = (entry: typeof entries[number]) => {
    const displayName = window.prompt('Display name', entry.displayName)?.trim();
    if (!displayName) return;
    const aliasText = window.prompt('OCR aliases (comma separated)', entry.aliases.join(', '));
    const why = reason(); if (!why || !actor.trim()) return;
    updateClass.mutate({ classKey: entry.key, data: { displayName, aliases: (aliasText ?? '').split(',').map((value) => value.trim()).filter(Boolean), actor, reason: why } }, { onSuccess: onRefresh, onError: (err) => setError(err instanceof Error ? err.message : 'Catalog change failed') });
  };
  const remove = (entry: typeof entries[number]) => {
    const why = reason(); if (!why || !window.confirm(`Permanently delete ${entry.displayName}? Historical classes cannot be deleted.`)) return;
    deleteClass.mutate({ classKey: entry.key, data: { actor, reason: why } }, { onSuccess: onRefresh, onError: (err) => setError(err instanceof Error ? err.message : 'Catalog change failed') });
  };
  return <section className="border border-border bg-card p-5"><div className="border-b border-border pb-4"><div className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">Catalog administration</div><h2 className="mt-2 font-display text-3xl font-bold">Classes for this game</h2><p className="mt-2 text-sm text-muted-foreground">Active classes appear in applications, OCR review, and match correction. Disabling preserves historical records.</p></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_1.5fr_auto]">
      <label><span className="field-label">Display name</span><input className="field-input mt-2" placeholder="Spear" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label><span className="field-label">Class key</span><input className="field-input mt-2 font-mono uppercase" placeholder="SPEAR" value={key} onChange={(e) => setKey(e.target.value.toUpperCase().replaceAll(' ', '_'))} /></label>
      <label><span className="field-label">OCR aliases</span><input className="field-input mt-2" placeholder="Spear, spear, SPEAR" value={aliases} onChange={(e) => setAliases(e.target.value)} /></label>
      <div className="flex items-end"><ActionButton onClick={add} disabled={createClass.isPending}>{createClass.isPending ? 'Adding…' : 'Add class'}</ActionButton></div>
    </div>
    {actor.trim().length < 2 ? <p className="mt-3 text-xs text-muted-foreground">An operator name is required for the audit record. Enter it in the field above.</p> : null}
    {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}<div className="mt-5 space-y-2">{entries.map((entry) => <div key={entry.key} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"><div><b>{entry.displayName}</b><span className="ml-2 font-mono text-[10px] text-muted-foreground">{entry.key}</span><div className="text-xs text-muted-foreground">{entry.aliases.join(', ') || 'No OCR aliases'}</div></div><div className="flex gap-2"><span className={`px-2 py-1 font-mono text-[10px] ${entry.active ? 'text-accent' : 'text-muted-foreground'}`}>{entry.active ? 'ACTIVE' : 'DISABLED'}</span><ActionButton onClick={() => edit(entry)} disabled={!actor}>Edit</ActionButton><ActionButton onClick={() => toggle(entry)} disabled={!actor}>{entry.active ? 'Disable' : 'Enable'}</ActionButton><ActionButton onClick={() => remove(entry)} disabled={entry.active || !actor}><Trash2 size={13} /> Delete</ActionButton></div></div>)}</div>
  </section>;
}

function AuditTrail({ records }: { records: Array<{ id: string; action: string; actor: string; reason: string; createdAt: string }> }) {
  if (!records.length) return null;
  return <details className="mt-5 border-t border-border pt-3"><summary className="cursor-pointer font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Audit history ({records.length})</summary><div className="mt-3 space-y-2">{records.map((record) => <div key={record.id} className="text-xs text-muted-foreground"><b className="text-foreground">{label(record.action)}</b> by {record.actor} · {new Date(record.createdAt).toLocaleString()}{record.reason ? <div className="mt-1">{record.reason}</div> : null}</div>)}</div></details>;
}

function ActionButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className="inline-flex items-center gap-1 border border-primary/40 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.1em] hover:bg-primary hover:text-primary-foreground disabled:opacity-40">{children}</button>;
}

function MatchEditor({ classes, match, actor, adminRequest, onClose, onSaved }: { classes: Array<{ key: string; displayName: string }>; match: AdminMatch; actor: string; adminRequest: AdminRequest; onClose: () => void; onSaved: () => void }) {
  const correction = useCorrectMatch({ request: adminRequest });
  const [reason, setReason] = useState('');
  const [draft, setDraft] = useState<MatchCorrection>({
    actor, reason: '', matchDate: instantToLocalDateTime(match.matchDate), winningTeam: match.winningTeam,
    note: match.note, participants: match.participants.map(({ playerId: _id, isWinner: _winner, ...row }) => row),
  });
  const updateRow = (index: number, key: keyof MatchCorrection['participants'][number], value: string | number) => setDraft((current) => ({ ...current, participants: current.participants.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row) }));
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    correction.mutate({ matchId: match.id, data: { ...draft, actor, reason, matchDate: localDateTimeToInstant(draft.matchDate) } }, { onSuccess: onSaved });
  };
  return <div className="fixed inset-0 z-50 overflow-y-auto bg-background/95 p-4 sm:p-8"><form onSubmit={submit} className="mx-auto max-w-6xl border border-primary/45 bg-card p-5">
    <div className="flex justify-between gap-4"><div><div className="field-label">Audited correction</div><h2 className="mt-2 font-display text-3xl font-bold">Correct archive match</h2></div><button type="button" onClick={onClose}><X /></button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><input type="datetime-local" className="field-input" value={draft.matchDate} onChange={(e) => setDraft({ ...draft, matchDate: e.target.value })} /><select className="field-input" value={draft.winningTeam} onChange={(e) => setDraft({ ...draft, winningTeam: e.target.value as TeamColor })}><option value={TeamColor.BLUE}>Blue won</option><option value={TeamColor.RED}>Red won</option><option value={TeamColor.YELLOW}>Yellow won</option></select><input className="field-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="Match note" /></div>
     <div className="mt-5 overflow-x-auto"><table className="min-w-[1150px] text-xs"><tbody>{draft.participants.map((row, index) => <tr key={index} className="border-t border-border"><td className="p-1"><select className="field-input" value={row.team} onChange={(e) => updateRow(index, 'team', e.target.value)}><option value={TeamColor.BLUE}>Blue</option><option value={TeamColor.RED}>Red</option><option value={TeamColor.YELLOW}>Yellow</option></select></td><td className="p-1"><input className="field-input" value={row.characterName} onChange={(e) => updateRow(index, 'characterName', e.target.value)} /></td>{(['mainWeapon', 'offWeapon'] as const).map((key) => <td className="p-1" key={key}><select className="field-input" value={row[key]} onChange={(e) => updateRow(index, key, e.target.value)}>{classes.map((entry) => <option key={entry.key} value={entry.key}>{entry.displayName}</option>)}{!classes.some((entry) => entry.key === row[key]) ? <option value={row[key]}>{label(row[key])} (historical)</option> : null}</select></td>)}{(['kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'] as const).map((key) => <td className="p-1" key={key}><input aria-label={`${key} ${index + 1}`} type="number" min="0" className="field-input w-24" value={row[key]} onChange={(e) => updateRow(index, key, Number(e.target.value))} /></td>)}</tr>)}</tbody></table></div>
    <label className="mt-5 block"><span className="field-label">Reason for correction</span><textarea required minLength={2} maxLength={500} className="field-input mt-2 min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    {correction.isError ? <p className="mt-3 text-sm text-destructive">Correction rejected. Check the team counts and all participant values.</p> : null}
    <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="border border-border px-4 py-3 text-xs font-bold uppercase">Cancel</button><button disabled={correction.isPending} className="bg-primary px-4 py-3 text-xs font-bold uppercase text-primary-foreground disabled:opacity-50">{correction.isPending ? 'Saving…' : 'Save audited correction'}</button></div>
  </form></div>;
}