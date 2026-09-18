import { AlertTriangle, CheckCircle2, ImageUp, LoaderCircle, ScanLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminSummaryQueryKey,
  getGetMatchesQueryKey,
  TeamColor,
  useCommitMatch,
  useGetClasses,
} from '@workspace/api-client-react';
import type { MatchInput } from '@workspace/api-client-react';
import {
  extractScoreboard,
  readImageDimensions,
  type VerifiedParticipant,
} from '@/lib/scoreboard-ocr';

const weaponLabel = (weapon: string) =>
  weapon.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The scoreboard screenshot could not be read.'));
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.readAsDataURL(file);
  });

export function ScoreboardVerifier({
  adminRequest,
  actor,
  onCommitted,
}: {
  adminRequest: { headers: { 'x-admin-key': string } };
  actor: string;
  onCommitted: (matchId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [participants, setParticipants] = useState<VerifiedParticipant[]>([]);
  const [date, setDate] = useState('');
  const [winningTeam, setWinningTeam] = useState<TeamColor>(TeamColor.BLUE);
  const [note, setNote] = useState('');
  const commitMutation = useCommitMatch({ request: adminRequest });
  const classes = useGetClasses();
  const classOptions = classes.data ?? [];
  const queryClient = useQueryClient();

  const chooseFile = async (selected: File | undefined) => {
    setError('');
    setParticipants([]);
    setConfidence(null);
    setImageDimensions(null);
    if (!selected) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(selected.type)) {
      setError('Use a PNG, JPEG, or WebP scoreboard screenshot.');
      return;
    }
    const dimensions = await readImageDimensions(selected);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(selected);
    setImageDimensions(dimensions);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const runExtraction = async () => {
    if (!file) return;
    setExtracting(true);
    setProgress(0);
    setError('');
    try {
       const result = await extractScoreboard(file, setProgress, classOptions);
      setParticipants(result.participants);
      setConfidence(result.confidence);
    } catch {
      setError('OCR could not read this screenshot. Try a clean, uncropped scoreboard capture.');
    } finally {
      setExtracting(false);
    }
  };

  const updateParticipant = <K extends keyof VerifiedParticipant>(
    index: number,
    key: K,
    value: VerifiedParticipant[K],
  ) => {
    setParticipants((current) =>
      current.map((participant, participantIndex) =>
        participantIndex === index
          ? {
              ...participant,
              [key]: value,
              confidence: key === 'confirmed' ? participant.confidence : 100,
              confirmed: key === 'confirmed' ? Boolean(value) : false,
            }
          : participant,
      ),
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Choose the source scoreboard screenshot before commit.');
      return;
    }
    if (participants.some((participant) => !participant.characterName.trim())) {
      setError('Every row needs a character name before commit.');
      return;
    }
    if (participants.length < 2 || participants.length > 96) {
      setError(`OCR found ${participants.length} rows. A verified match requires two teams with no more than 48 players each.`);
      return;
    }
    if (participants.some((participant) => participant.mainWeapon === null || participant.offWeapon === null)) {
      setError('Select both weapons for every participant before commit.');
      return;
    }
    if (participants.some((participant) =>
      participant.kills === null ||
      participant.assists === null ||
      participant.damageDealt === null ||
      participant.healingDone === null
    )) {
      setError('Enter every participant statistic before commit.');
      return;
    }
    const normalizedNames = participants.map((participant) => participant.characterName.trim().toLocaleLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      setError('Each participant must appear exactly once.');
      return;
    }
    const bluePlayers = participants.filter((participant) => participant.team === TeamColor.BLUE).length;
    const redPlayers = participants.filter((participant) => participant.team === TeamColor.RED).length;
    if (bluePlayers < 1 || redPlayers < 1 || bluePlayers > 48 || redPlayers > 48) {
      setError('Assign between 1 and 48 participants to each team.');
      return;
    }
    if (participants.some((participant) => !participant.confirmed)) {
      setError('Confirm all twelve rows against the screenshot before commit.');
      return;
    }
    const payload: MatchInput = {
      actor,
      matchDate: date || undefined,
      winningTeam,
      note: note || undefined,
      screenshot: {
        name: file.name,
        contentType: file.type as MatchInput['screenshot']['contentType'],
        base64: await fileToBase64(file),
      },
      participants: participants.map(({ confidence: _confidence, confirmed: _confirmed, ...participant }) => ({
        ...participant,
        characterName: participant.characterName.trim(),
         mainWeapon: participant.mainWeapon as string,
         offWeapon: participant.offWeapon as string,
        kills: participant.kills as number,
        assists: participant.assists as number,
        damageDealt: participant.damageDealt as number,
        healingDone: participant.healingDone as number,
      })),
    };
    commitMutation.mutate(
      { data: payload },
      {
        onSuccess: (match) => {
          queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMatchesQueryKey({ limit: 50 }) });
          onCommitted(match.id);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="mt-7">
      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-48 w-full flex-col items-center justify-center border border-dashed border-primary/50 bg-primary/5 p-6 text-center transition-colors hover:bg-primary/10"
            data-testid="button-upload-scoreboard"
          >
            <ImageUp className="text-primary" />
            <span className="mt-4 text-sm font-bold">{file ? file.name : 'Choose scoreboard screenshot'}</span>
            <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
              PNG, JPEG, or WebP · any screenshot size
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
            data-testid="input-scoreboard-file"
          />
          {previewUrl ? <img src={previewUrl} alt="Scoreboard awaiting OCR" className="mt-3 w-full border border-border" /> : null}
          {imageDimensions ? <p className="mt-2 text-xs text-muted-foreground">{imageDimensions.width}×{imageDimensions.height} accepted. OCR will scale it automatically while preserving its aspect ratio.</p> : null}
          <button
            type="button"
            disabled={!file || extracting}
            onClick={() => void runExtraction()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 bg-secondary px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] text-secondary-foreground disabled:opacity-50"
            data-testid="button-run-ocr"
          >
            {extracting ? <LoaderCircle size={15} className="animate-spin" /> : <ScanLine size={15} />}
            {extracting ? `Reading scoreboard ${progress}%` : 'Extract scoreboard'}
          </button>
        </div>
        <div className="border border-border bg-background/35 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="field-label">Verification status</div>
              <div className="mt-2 text-sm font-bold">
                {participants.length ? `${participants.length} rows extracted for operator review` : 'Upload and extract to begin'}
              </div>
            </div>
            {confidence !== null ? (
              <div className={`border px-3 py-2 font-mono text-xs font-bold ${confidence >= 80 ? 'border-accent text-accent' : 'border-primary text-primary'}`}>
                {confidence}% OCR
              </div>
            ) : null}
          </div>
          <p className="mt-5 text-xs leading-6 text-muted-foreground">
             OCR is a draft for two teams of up to 48 players each. Check every field against the screenshot, then confirm each row. Editing a row clears its confirmation.
          </p>
        </div>
      </div>

      {participants.length ? (
        <>
          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <label><span className="field-label">Match date</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} className="field-input" /></label>
            <label><span className="field-label">Winning team</span><select value={winningTeam} onChange={(event) => setWinningTeam(event.target.value as TeamColor)} className="field-input"><option value={TeamColor.BLUE}>Blue</option><option value={TeamColor.RED}>Red</option></select></label>
            <label><span className="field-label">Field note</span><input value={note} onChange={(event) => setNote(event.target.value)} className="field-input" placeholder="What decided the fight?" /></label>
          </div>
          <div className="mt-7 overflow-x-auto border border-border">
            <table className="w-full min-w-[1050px] text-left text-xs">
              <thead className="bg-muted/60 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>{['Team', 'Character', 'Main weapon', 'Off weapon', 'Kills', 'Assists', 'Damage', 'Healing', 'Check'].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
              </thead>
              <tbody>
                {participants.map((participant, index) => (
                  <tr key={index} className={`border-t border-border ${participant.confidence < 80 ? 'bg-primary/5' : ''}`}>
                    <td className="p-2">
                      <select
                        aria-label={`Team ${index + 1}`}
                        value={participant.team}
                        onChange={(event) => updateParticipant(index, 'team', event.target.value as TeamColor)}
                        className={`field-input min-w-24 font-mono font-bold ${participant.team === TeamColor.BLUE ? 'text-accent' : 'text-primary'}`}
                      >
                        <option value={TeamColor.BLUE}>Blue</option>
                        <option value={TeamColor.RED}>Red</option>
                      </select>
                    </td>
                    <td className="p-2"><input aria-label={`Character ${index + 1}`} value={participant.characterName} onChange={(event) => updateParticipant(index, 'characterName', event.target.value)} className="field-input min-w-36" /></td>
                     <td className="p-2"><WeaponSelect options={classOptions} value={participant.mainWeapon} onChange={(value) => updateParticipant(index, 'mainWeapon', value)} /></td>
                     <td className="p-2"><WeaponSelect options={classOptions} value={participant.offWeapon} onChange={(value) => updateParticipant(index, 'offWeapon', value)} /></td>
                    {(['kills', 'assists', 'damageDealt', 'healingDone'] as const).map((key) => (
                      <td className="p-2" key={key}><input aria-label={`${key} ${index + 1}`} type="number" min="0" step="1" value={participant[key] ?? ''} onChange={(event) => updateParticipant(index, key, event.target.value === '' ? null : Math.max(0, Number.parseInt(event.target.value, 10)))} className="field-input w-24" /></td>
                    ))}
                    <td className="px-3 py-2">
                      <label className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide">
                        <input
                          type="checkbox"
                          aria-label={`Confirm row ${index + 1}`}
                          checked={participant.confirmed}
                          onChange={(event) => updateParticipant(index, 'confirmed', event.target.checked)}
                        />
                        {participant.confirmed ? <CheckCircle2 size={16} className="text-accent" /> : <AlertTriangle size={16} className="text-primary" />}
                        {participant.confirmed ? 'Confirmed' : 'Confirm'}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {error || commitMutation.isError ? <div className="mt-5 border border-destructive/35 bg-destructive/5 p-3 text-sm text-muted-foreground">{error || 'Commit rejected. Confirm every field and operator authorization.'}</div> : null}
          <div className="mt-7 flex justify-end">
            <button type="submit" disabled={commitMutation.isPending || actor.trim().length < 2 || participants.length < 2 || participants.length > 96 || participants.some((participant) => !participant.confirmed)} className="inline-flex items-center gap-2 bg-primary px-5 py-3 text-xs font-bold uppercase tracking-[0.13em] text-primary-foreground disabled:opacity-60" data-testid="button-commit-match">
              {commitMutation.isPending ? 'Writing...' : 'Commit verified result'} <CheckCircle2 size={15} />
            </button>
          </div>
        </>
      ) : error ? <div className="mt-5 border border-destructive/35 bg-destructive/5 p-3 text-sm text-muted-foreground">{error}</div> : null}
    </form>
  );
}

function WeaponSelect({ options, value, onChange }: { options: Array<{ key: string; displayName: string }>; value: string | null; onChange: (value: string | null) => void }) {
  return <select aria-label="Class" value={value ?? ''} onChange={(event) => onChange(event.target.value || null)} className="field-input min-w-36"><option value="">Select class</option>{options.map((entry) => <option key={entry.key} value={entry.key}>{entry.displayName || weaponLabel(entry.key)}</option>)}</select>;
}