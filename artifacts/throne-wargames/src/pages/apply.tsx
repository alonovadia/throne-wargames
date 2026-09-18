import { Check, ChevronRight, ClipboardList, Send, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCreateApplication, useGetClasses } from '@workspace/api-client-react';
import type { ApplicationInput } from '@workspace/api-client-react';
import { PageIntro } from '@/components/wargames-shell';
import { Form } from '@/components/ui/form';
import { trackEvent } from '@/lib/analytics';

const weaponSchema = z.string().min(1, 'Select a class');
const memberSchema = z.object({
  characterName: z.string().min(2, 'Enter a character name').max(40),
  mainWeapon: weaponSchema,
  offWeapon: weaponSchema,
});
const applicationSchema = z.object({
  groupName: z.string().min(2, 'Enter your group name').max(80),
  captainName: z.string().min(2, 'Enter the captain name').max(40),
  captainContact: z.string().min(3, 'Add a contact route').max(120),
  notes: z.string().max(1000).optional(),
  website: z.string().max(0),
  members: z.array(memberSchema).length(6),
});
type ApplicationForm = z.infer<typeof applicationSchema>;

const blankMember = { characterName: '', mainWeapon: '', offWeapon: '' };

export default function ApplyPage() {
  const [receipt, setReceipt] = useState<{ id: string; message: string } | null>(null);
  const formStartedAt = useRef(Date.now());
  const submissionToken = useRef(crypto.randomUUID());
  const mutation = useCreateApplication();
  const classes = useGetClasses();
  const classOptions = classes.data ?? [];
  const form = useForm<ApplicationForm>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      groupName: '',
      captainName: '',
      captainContact: '',
      notes: '',
      website: '',
      members: Array.from({ length: 6 }, () => ({ ...blankMember })),
    },
  });
  const completedMembers = form.watch('members').filter(
    (member) =>
      member.characterName.trim().length >= 2 &&
       classOptions.some((entry) => entry.key === member.mainWeapon) &&
       classOptions.some((entry) => entry.key === member.offWeapon),
  ).length;

  const submit = (values: ApplicationForm) => {
    mutation.mutate({ data: {
      ...values,
      submissionToken: submissionToken.current,
      formStartedAt: formStartedAt.current,
    } as ApplicationInput }, {
      onSuccess: (result) => {
        trackEvent('roster_application_submitted', {
          member_count: values.members.length,
          completed_members: completedMembers,
        });
        setReceipt({ id: result.id, message: result.message });
        form.reset();
        formStartedAt.current = Date.now();
        submissionToken.current = crypto.randomUUID();
      },
    });
  };

  return (
    <div>
      <PageIntro eyebrow="Roster application / six seats" title={<>Bring the<br /><span className="text-primary">whole formation.</span></>} detail="The archive is built for complete teams. Submit six players, two weapon slots each, and a captain who can answer when the record keeper calls." />
      <section className="mx-auto grid max-w-[1440px] gap-12 px-5 pb-20 lg:grid-cols-[0.68fr_1.32fr] lg:px-10">
        <aside className="ink-panel h-fit p-7 sm:p-9 lg:sticky lg:top-28">
          <ClipboardList size={20} className="relative text-primary" />
          <h2 className="relative mt-14 font-display text-3xl font-bold leading-[0.95] tracking-[-0.05em]">Six names.<br /><span className="text-primary">One record.</span></h2>
          <div className="relative mt-8 space-y-5 border-t border-slate-700 pt-6">
            {['A public group identity', 'A captain we can reach', 'Six complete player slots', 'Two weapon choices per player'].map((item, index) => <div key={item} className="flex items-start gap-3 text-sm text-slate-300"><span className="grid size-5 shrink-0 place-items-center border border-primary/60 font-mono text-[10px] text-primary">{index + 1}</span>{item}</div>)}
          </div>
          <p className="relative mt-10 border-l border-primary pl-4 text-xs leading-6 text-slate-400">Applications are reviewed by authorized operators. Public profiles and match records are only created after verification.</p>
        </aside>

        <div>
          {receipt ? (
            <div className="border border-primary/45 bg-primary/8 p-8" data-testid="status-application-success">
              <div className="grid size-12 place-items-center bg-primary text-primary-foreground"><Check size={24} /></div>
              <div className="mt-8 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Application received / {receipt.id}</div>
              <h2 className="mt-3 font-display text-4xl font-bold tracking-[-0.05em]">The formation is<br />on the board.</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground">{receipt.message || 'An authorized operator will review the six seats and contact your captain.'}</p>
              <button type="button" onClick={() => setReceipt(null)} data-testid="button-submit-another" className="mt-8 inline-flex items-center gap-2 border border-border px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] transition-colors hover:border-primary hover:text-primary">Submit another roster <ChevronRight size={15} /></button>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="space-y-10" data-testid="form-application">
              <div className="hidden" aria-hidden="true">
                <label>Website<input {...form.register('website')} tabIndex={-1} autoComplete="off" /></label>
              </div>
              <div className="border-b border-border pb-8">
                <div className="mb-6 flex items-center gap-3"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">01 / Identity</span><span className="h-px flex-1 bg-border" /></div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Group name" error={form.formState.errors.groupName?.message}><input {...form.register('groupName')} data-testid="input-group-name" placeholder="e.g. Ashen Vanguard" className="field-input" /></Field>
                  <Field label="Captain name" error={form.formState.errors.captainName?.message}><input {...form.register('captainName')} data-testid="input-captain-name" placeholder="Character or handle" className="field-input" /></Field>
                  <Field label="Captain contact" error={form.formState.errors.captainContact?.message}><input {...form.register('captainContact')} data-testid="input-captain-contact" placeholder="Discord, email, or guild channel" className="field-input" /></Field>
                  <Field label="Notes for the record"><input {...form.register('notes')} data-testid="input-application-notes" placeholder="Usual play window, roster identity..." className="field-input" /></Field>
                </div>
              </div>
              <div>
                <div className="mb-6 flex items-center gap-3"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-primary">02 / The six seats</span><span className="h-px flex-1 bg-border" /><span className="font-mono text-[10px] text-muted-foreground">{completedMembers} / 6 complete</span></div>
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="grid gap-3 border border-border bg-card p-4 sm:grid-cols-[30px_1.2fr_1fr_1fr] sm:items-end">
                      <div className="font-display text-xl font-bold text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                      <Field label={index === 0 ? 'Character name' : undefined} error={form.formState.errors.members?.[index]?.characterName?.message}><input {...form.register(`members.${index}.characterName`)} data-testid={`input-member-name-${index + 1}`} placeholder={`Player ${index + 1}`} className="field-input" /></Field>
                       <Field label={index === 0 ? 'Main class' : undefined} error={form.formState.errors.members?.[index]?.mainWeapon?.message}><select {...form.register(`members.${index}.mainWeapon`)} data-testid={`select-member-main-${index + 1}`} className="field-input"><option value="">Select class</option>{classOptions.map((entry) => <option key={entry.key} value={entry.key}>{entry.displayName}</option>)}</select></Field>
                       <Field label={index === 0 ? 'Off class' : undefined} error={form.formState.errors.members?.[index]?.offWeapon?.message}><select {...form.register(`members.${index}.offWeapon`)} data-testid={`select-member-off-${index + 1}`} className="field-input"><option value="">Select class</option>{classOptions.map((entry) => <option key={entry.key} value={entry.key}>{entry.displayName}</option>)}</select></Field>
                    </div>
                  ))}
                </div>
              </div>
              {mutation.isError ? <div className="border border-destructive/40 bg-destructive/5 p-4 text-sm text-muted-foreground" data-testid="status-application-error">The application could not be sent. Check the details and try again.</div> : null}
              <div className="flex flex-col justify-between gap-5 border-t border-border pt-6 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck size={15} className="text-primary" /> Reviewed by authorized operators</div>
                <button type="submit" disabled={mutation.isPending} data-testid="button-submit-application" className="inline-flex items-center justify-center gap-3 bg-primary px-6 py-3 text-xs font-bold uppercase tracking-[0.13em] text-primary-foreground transition-transform hover:-translate-y-1 disabled:cursor-wait disabled:opacity-60">{mutation.isPending ? 'Sending record...' : 'Submit six-player roster'} <Send size={15} /></button>
              </div>
              </form>
            </Form>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({ label, error, children }: { label?: string; error?: string; children: React.ReactNode }) {
  return <label className="block">{label ? <span className="mb-2 block font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</span> : null}{children}{error ? <span className="mt-1 block text-[11px] text-destructive">{error}</span> : null}</label>;
}