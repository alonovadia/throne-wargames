import { AlertTriangle, CheckCircle2, ImageUp, LoaderCircle, ScanLine, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminSummaryQueryKey,
  getGetMatchesQueryKey,
  TeamColor,
  useCommitMatch,
  useEnhanceScoreboardOcr,
  useGetClasses,
} from '@workspace/api-client-react';
import type { MatchInput } from '@workspace/api-client-react';
import {
  extractScoreboard,
  mergeOcrParticipants,
  mergeExternalOcr,
  parseScoreboardText,
  readImageDimensions,
  defaultBoundaries,
  type ColumnBoundary,
  type ScoreboardExtraction,
  type VerifiedParticipant,
} from '@/lib/scoreboard-ocr';
import { trackEvent } from '@/lib/analytics';

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
  onCommitted: (matchId: string, participantCount: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const file = files[0] ?? null;
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [preprocessing, setPreprocessing] = useState<string | null>(null);
  const [ocrSource, setOcrSource] = useState<'local' | 'hybrid'>('local');
  const [enhancementError, setEnhancementError] = useState('');
  const [enhancing, setEnhancing] = useState(false);
  const [participants, setParticipants] = useState<VerifiedParticipant[]>([]);
  const [duplicateRows, setDuplicateRows] = useState(0);
  const [date, setDate] = useState('');
  const [winningTeam, setWinningTeam] = useState<TeamColor>(TeamColor.BLUE);
  const [note, setNote] = useState('');
  const [boundaries, setBoundaries] = useState<ColumnBoundary[]>(defaultBoundaries);
  const commitMutation = useCommitMatch({ request: adminRequest });
  const enhanceOcrMutation = useEnhanceScoreboardOcr({ request: adminRequest });
  const classes = useGetClasses();
  const classOptions = classes.data ?? [];
  const queryClient = useQueryClient();

  const chooseFiles = async (selected: File[]) => {
    setError('');
    setParticipants([]);
    setDuplicateRows(0);
    setConfidence(null);
    setPreprocessing(null);
    setProgress(0);
    setOcrSource('local');
    setEnhancementError('');
    setImageDimensions(null);
    if (!selected.length) {
      setFiles([]);
      setPreviewUrl('');
      return;
    }
    if (selected.some((candidate) => !['image/png', 'image/jpeg', 'image/webp'].includes(candidate.type))) {
      setError('Use a PNG, JPEG, or WebP scoreboard screenshot.');
      return;
    }
    const dimensions = await readImageDimensions(selected[0]);
    setFiles(selected);
    setImageDimensions(dimensions);
    setPreviewUrl(URL.createObjectURL(selected[0]));
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const runExtraction = async () => {
    if (!files.length) return;
    setExtracting(true);
    setProgress(0);
    setError('');
    try {
      const extractions = [];
      for (const [index, sourceFile] of files.entries()) {
        const result = await extractScoreboard(
          sourceFile,
          (currentProgress) =>
            setProgress(Math.round(((index * 100) + currentProgress) / files.length)),
          classOptions,
          boundaries,
        );
        extractions.push(result);
      }
      const merged = mergeOcrParticipants(extractions);
      const averageConfidence = Math.round(
        extractions.reduce((sum, extraction) => sum + extraction.confidence, 0) / extractions.length,
      );
      trackEvent('scoreboard_extracted', {
        row_count: merged.participants.length,
        source_count: files.length,
        duplicate_rows_removed: merged.duplicateCount,
        ocr_confidence: averageConfidence,
      });
      setParticipants(merged.participants);
      setDuplicateRows(merged.duplicateCount);
      setConfidence(averageConfidence);
      setPreprocessing(extractions.map((extraction) => extraction.preprocessing).join(' + '));
      setOcrSource('local');
    } catch {
      setError('OCR could not read this screenshot. Try a clean, uncropped scoreboard capture.');
    } finally {
      setExtracting(false);
    }
  };

  const runEnhancedExtraction = async () => {
    if (!files.length || enhancing) return;
    setEnhancing(true);
    setEnhancementError('');
    try {
      let mergedExtraction: ScoreboardExtraction = {
        participants,
        confidence: confidence ?? 0,
        rawText: '',
        preprocessing: (preprocessing === 'contrast' || preprocessing === 'threshold'
          ? preprocessing
          : 'original') as 'original' | 'contrast' | 'threshold',
        weaponEvidence: [],
      };
      const warnings: string[] = [];
      for (const [index, sourceFile] of files.entries()) {
        setEnhancementError(`Checking screenshot ${index + 1} of ${files.length}…`);
        const response = await enhanceOcrMutation.mutateAsync({
          data: {
            name: sourceFile.name,
            contentType: sourceFile.type as 'image/png' | 'image/jpeg' | 'image/webp',
            base64: await fileToBase64(sourceFile),
          },
        });
        const externalExtraction = parseScoreboardText(
          response.text,
          response.confidence ?? 0,
          classOptions,
          { inferTeams: false },
        );
        mergedExtraction = mergeExternalOcr(mergedExtraction, externalExtraction);
        warnings.push(...response.warnings);
      }
      setParticipants(mergedExtraction.participants);
      setConfidence(mergedExtraction.confidence);
      setOcrSource('hybrid');
      if (warnings.length > 0) {
        setEnhancementError(`External OCR returned warnings: ${warnings.join(' · ')}`);
      } else {
        setEnhancementError('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Enhanced OCR could not be completed.';
      setEnhancementError(message);
    } finally {
      setEnhancing(false);
    }
  };

  const updateBoundary = (index: number, newEnd: number) => {
    setBoundaries((current) => {
      const updated = [...current];
      // Bound the movement by previous start and next end
      const min = updated[index].start + 1;
      const max = updated[index + 1].end - 1;
      const validEnd = Math.max(min, Math.min(max, newEnd));
      
      updated[index] = { ...updated[index], end: validEnd };
      updated[index + 1] = { ...updated[index + 1], start: validEnd };
      return updated;
    });
  };

  const addParticipantRow = () => {
    setParticipants(current => [...current, {
      rank: null,
      characterName: '',
      team: TeamColor.BLUE,
      mainWeapon: null,
      offWeapon: null,
      kills: null,
      assists: null,
      damageDealt: null,
      damageTaken: null,
      healingDone: null,
      confidence: 0,
      fieldConfidence: {},
      warnings: ['Manually added row'],
      confirmed: false,
    }]);
  };

  const removeParticipantRow = (index: number) => {
    setParticipants(current => current.filter((_, i) => i !== index));
  };

  const updateParticipant = <K extends keyof VerifiedParticipant>(
    index: number,
    key: K,
    value: VerifiedParticipant[K],
  ) => {
    const warningBelongsToField = (warning: string) => {
      if (key === 'characterName') return warning.startsWith('Character name');
      if (key === 'team') return warning.startsWith('Team');
      return typeof key === 'string' && warning.startsWith(key);
    };
    setParticipants((current) =>
      current.map((participant, participantIndex) =>
        participantIndex === index
          ? {
              ...participant,
              [key]: value,
              confidence: key === 'confirmed' ? participant.confidence : 100,
              fieldConfidence: key === 'confirmed'
                ? participant.fieldConfidence
                : { ...participant.fieldConfidence, [key]: 100 },
              warnings: key === 'confirmed'
                ? participant.warnings
                : participant.warnings.filter((warning) => !warningBelongsToField(warning)),
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
    if (participants.some((participant) => participant.team === null)) {
      setError('Assign a team to every row before commit.');
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
      participant.damageTaken === null ||
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
    const teamCounts = new Map<TeamColor, number>();
    participants.forEach((participant) => {
      if (!participant.team) return;
      teamCounts.set(participant.team, (teamCounts.get(participant.team) ?? 0) + 1);
    });
    if (teamCounts.size !== 2 || [...teamCounts.values()].some((count) => count < 1 || count > 48)) {
      setError('Assign exactly two teams with between 1 and 48 participants each.');
      return;
    }
    if (!teamCounts.has(winningTeam)) {
      setError('The winning team must be one of the two teams in this match.');
      return;
    }
    if (participants.some((participant) => !participant.confirmed)) {
      setError('Confirm all rows against the screenshot before commit.');
      return;
    }
    const normalizedMatchDate = date ? new Date(date) : null;
    if (normalizedMatchDate && !Number.isFinite(normalizedMatchDate.getTime())) {
      setError('Enter a valid match date before commit.');
      return;
    }
    const payload: MatchInput = {
      actor,
      matchDate: normalizedMatchDate ? normalizedMatchDate.toISOString() : undefined,
      winningTeam,
      note: note || undefined,
      screenshot: {
        name: file.name,
        contentType: file.type as MatchInput['screenshot']['contentType'],
        base64: await fileToBase64(file),
      },
      participants: participants.map(({
        rank: _rank,
        confidence: _confidence,
        confirmed: _confirmed,
        fieldConfidence: _fieldConfidence,
        warnings: _warnings,
        ...participant
      }) => ({
        ...participant,
        team: participant.team as TeamColor,
        characterName: participant.characterName.trim(),
         mainWeapon: participant.mainWeapon as string,
         offWeapon: participant.offWeapon as string,
        kills: participant.kills as number,
        assists: participant.assists as number,
        damageDealt: participant.damageDealt as number,
        damageTaken: participant.damageTaken as number,
        healingDone: participant.healingDone as number,
      })),
    };
    commitMutation.mutate(
      { data: payload },
      {
        onSuccess: (match) => {
          queryClient.invalidateQueries({ queryKey: getGetAdminSummaryQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMatchesQueryKey({ limit: 50 }) });
          onCommitted(match.id, participants.length);
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
            <span className="mt-4 text-sm font-bold">
              {files.length
                ? `${files.length} screenshot${files.length === 1 ? '' : 's'} selected`
                : 'Choose scoreboard screenshots'}
            </span>
            <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">
              PNG, JPEG, or WebP · select overlapping captures together
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="sr-only"
            onChange={(event) => void chooseFiles(Array.from(event.target.files ?? []))}
            data-testid="input-scoreboard-file"
          />
          {files.length ? (
            <div className="mt-3 border border-border bg-muted/20 p-3">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {file?.name} is the archived source image
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                All {files.length} selected screenshots contribute to OCR. The current match record stores only the first image.
              </p>
              {files.length > 1 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {files.map((selectedFile, index) => (
                    <li key={`${selectedFile.name}-${selectedFile.lastModified}-${index}`} className="truncate">
                      {index + 1}. {selectedFile.name}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {previewUrl ? (
            <div className="mt-3 w-full border border-border">
              <div className="relative">
                <img src={previewUrl} alt="First scoreboard screenshot awaiting OCR" className="block w-full h-auto" />
                {boundaries.map((boundary) => (
                  <div
                    key={boundary.key}
                    className="pointer-events-none absolute inset-y-0 border-l border-dashed border-primary/80"
                    style={{ left: `${boundary.start}%` }}
                  >
                    <div className="absolute left-1 top-2 bg-background/85 px-1 py-0.5 font-mono text-[8px] text-primary">
                      {boundary.label}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-2 p-2 bg-muted/20 border-t border-border">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold font-mono text-muted-foreground uppercase tracking-wider">Adjust OCR Columns</span>
                  <button 
                    type="button" 
                    onClick={() => setBoundaries(defaultBoundaries)}
                    className="text-[10px] uppercase font-bold text-primary hover:underline"
                  >
                    Reset Defaults
                  </button>
                </div>
                {boundaries.slice(0, -1).map((boundary, i) => (
                  <div key={boundary.key} className="flex items-center gap-3">
                    <label className="text-[10px] uppercase w-32 shrink-0 font-mono text-muted-foreground text-right">
                      {boundary.label} / {boundaries[i+1].label}
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.1"
                      value={boundary.end}
                      onChange={(e) => updateBoundary(i, parseFloat(e.target.value))}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-[10px] font-mono w-8">{boundary.end.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
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
          {participants.length > 0 ? (
            <div className="mt-3 border border-primary/30 bg-primary/5 p-3">
              <button
                type="button"
                disabled={enhancing || extracting}
                onClick={() => void runEnhancedExtraction()}
                className="inline-flex w-full items-center justify-center gap-2 border border-primary/60 px-4 py-3 text-xs font-bold uppercase tracking-[0.13em] text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                data-testid="button-enhance-ocr"
              >
                {enhancing ? <LoaderCircle size={15} className="animate-spin" /> : <ScanLine size={15} />}
                {enhancing ? 'Checking selected screenshots' : 'Try enhanced OCR'}
              </button>
              <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
                Sends each selected screenshot to the configured external OCR provider. Missing fields may be suggested; disagreements remain flagged for review.
              </p>
              {enhancementError ? <p className="mt-2 text-xs text-primary">{enhancementError}</p> : null}
            </div>
          ) : null}
        </div>
        <div className="border border-border bg-background/35 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="field-label">Verification status</div>
              <div className="mt-2 text-sm font-bold">
                {participants.length ? `${participants.length} rows extracted for operator review` : 'Upload and extract to begin'}
              </div>
              {participants.length ? (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {participants.filter((participant) => !participant.confirmed && participant.warnings.length > 0).length} rows need attention
                  {preprocessing ? ` · ${preprocessing} image pass selected` : ''}
                   {files.length > 1 ? ` · ${files.length} screenshots merged` : ''}
                   {duplicateRows > 0 ? ` · ${duplicateRows} duplicate ${duplicateRows === 1 ? 'row' : 'rows'} removed` : ''}
                  {ocrSource === 'hybrid' ? ' · external suggestions merged' : ''}
                </div>
              ) : null}
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
            <label><span className="field-label">Winning team</span><select value={winningTeam} onChange={(event) => setWinningTeam(event.target.value as TeamColor)} className="field-input"><option value={TeamColor.BLUE}>Blue</option><option value={TeamColor.RED}>Red</option><option value={TeamColor.YELLOW}>Yellow</option></select></label>
            <label><span className="field-label">Field note</span><input value={note} onChange={(event) => setNote(event.target.value)} className="field-input" placeholder="What decided the fight?" /></label>
          </div>
          <div className="mt-7 overflow-x-auto border border-border relative">
            <table className="w-full min-w-[1150px] text-left text-xs">
              <thead className="bg-muted/60 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                <tr>{['Team', 'Character', 'Main weapon', 'Off weapon', 'Kills', 'Assists', 'Damage', 'Taken', 'Healing', 'Check', ''].map((label) => <th key={label} className="px-3 py-3">{label}</th>)}</tr>
              </thead>
              <tbody>
                {participants.map((participant, index) => (
                  <tr
                    key={index}
                    data-rank={participant.rank ?? ''}
                    title={participant.warnings.join(' · ') || 'No OCR warnings'}
                    className={`border-t border-border ${!participant.confirmed && (participant.warnings.length || participant.confidence < 80) ? 'bg-primary/5' : ''}`}
                  >
                    <td className="p-2">
                      <select
                        aria-label={`Team ${index + 1}`}
                        value={participant.team ?? ''}
                        onChange={(event) => updateParticipant(index, 'team', event.target.value ? event.target.value as TeamColor : null)}
                        className={`field-input min-w-24 font-mono font-bold ${participant.team === TeamColor.BLUE ? 'text-accent' : participant.team === TeamColor.RED ? 'text-primary' : participant.team === TeamColor.YELLOW ? 'text-yellow-500' : 'text-muted-foreground'}`}
                      >
                        <option value="">Review team</option>
                        <option value={TeamColor.BLUE}>Blue</option>
                        <option value={TeamColor.RED}>Red</option>
                        <option value={TeamColor.YELLOW}>Yellow</option>
                      </select>
                    </td>
                    <td className="p-2"><input aria-label={`Character ${index + 1}`} title={participant.fieldConfidence.characterName !== undefined ? `OCR confidence ${participant.fieldConfidence.characterName}%` : undefined} value={participant.characterName} onChange={(event) => updateParticipant(index, 'characterName', event.target.value)} className={`field-input min-w-36 ${(participant.fieldConfidence.characterName ?? 100) < 65 ? 'border-primary' : ''}`} /></td>
                     <td className="p-2"><WeaponSelect options={classOptions} value={participant.mainWeapon} onChange={(value) => updateParticipant(index, 'mainWeapon', value)} /></td>
                     <td className="p-2"><WeaponSelect options={classOptions} value={participant.offWeapon} onChange={(value) => updateParticipant(index, 'offWeapon', value)} /></td>
                    {(['kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'] as const).map((key) => (
                      <td className="p-2" key={key}><input aria-label={`${key} ${index + 1}`} title={participant.fieldConfidence[key] !== undefined ? `OCR confidence ${participant.fieldConfidence[key]}%` : undefined} type="number" min="0" step="1" value={participant[key] ?? ''} onChange={(event) => updateParticipant(index, key, event.target.value === '' ? null : Math.max(0, Number.parseInt(event.target.value, 10)))} className={`field-input w-24 ${participant[key] === null || (participant.fieldConfidence[key] ?? 100) < 65 ? 'border-primary bg-primary/5' : ''}`} /></td>
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
                    <td className="px-2">
                      <button type="button" onClick={() => removeParticipantRow(index)} className="text-muted-foreground hover:text-destructive p-1 rounded-sm hover:bg-destructive/10" aria-label={`Remove row ${index + 1}`} title="Remove row">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-t border-border p-2 bg-muted/20">
              <button 
                type="button" 
                onClick={addParticipantRow}
                className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold text-muted-foreground hover:text-primary transition-colors"
              >
                <Plus size={14} /> Add Row
              </button>
            </div>
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