import { createWorker, type LoggerMessage } from 'tesseract.js';
import { TeamColor } from '@workspace/api-client-react';
import {
  classifyTeamPixels,
  cleanNumericCell,
  clusterRowAnchors,
  detectTeamFromText,
  scoreExtractionCandidate,
  type DetectedCell,
  type OcrFieldKey,
  type TeamDetection,
} from './scoreboard-ocr-core';

export type ParticipantField =
  | 'rank'
  | 'characterName'
  | 'team'
  | 'kills'
  | 'assists'
  | 'damageDealt'
  | 'damageTaken'
  | 'healingDone';

export type VerifiedParticipant = {
  rank: number | null;
  characterName: string;
  team: TeamColor | null;
  mainWeapon: string | null;
  offWeapon: string | null;
  kills: number | null;
  assists: number | null;
  damageDealt: number | null;
  damageTaken: number | null;
  healingDone: number | null;
  confidence: number;
  fieldConfidence: Partial<Record<ParticipantField, number>>;
  warnings: string[];
  confirmed: boolean;
};

export type ScoreboardExtraction = {
  participants: VerifiedParticipant[];
  confidence: number;
  rawText: string;
  preprocessing: 'original' | 'contrast' | 'threshold';
};

export type ColumnBoundary = {
  key: string;
  label: string;
  start: number;
  end: number;
};

export const defaultBoundaries: ColumnBoundary[] = [
  { key: 'rank', label: 'Rank', start: 0, end: 10.5 },
  { key: 'weapons', label: 'Weapons', start: 10.5, end: 15.5 },
  { key: 'guild', label: 'Guild', start: 15.5, end: 34 },
  { key: 'name', label: 'Name', start: 34, end: 52.5 },
  { key: 'team', label: 'Team', start: 52.5, end: 59.5 },
  { key: 'kills', label: 'Kills', start: 59.5, end: 66 },
  { key: 'assists', label: 'Assists', start: 66, end: 72.5 },
  { key: 'damageDealt', label: 'Damage', start: 72.5, end: 81.5 },
  { key: 'damageTaken', label: 'Taken', start: 81.5, end: 91.2 },
  { key: 'healingDone', label: 'Healing', start: 91.2, end: 100 },
];

const minimumOcrEdge = 1920;
const maximumOcrEdge = 3200;

const weaponAliases: Array<[RegExp, string]> = [
  [/\b(great\s*sword|gs)\b/i, 'GREATSWORD'],
  [/\b(sword\s*(and|&)\s*shield|sns|swordshield)\b/i, 'SWORD_AND_SHIELD'],
  [/\b(cross\s*bow|xbow)\b/i, 'CROSSBOW'],
  [/\b(long\s*bow|bow)\b/i, 'LONGBOW'],
  [/\bdagger(s)?\b/i, 'DAGGER'],
  [/\bstaff\b/i, 'STAFF'],
  [/\bwand\b/i, 'WAND'],
];

function parseLine(line: string, columnIndex: number, aliases = weaponAliases): VerifiedParticipant | null {
  const numbers = [...line.matchAll(/\b\d[\d,.]*\b/g)].map((match) =>
    Number(match[0].replace(/[,.]/g, '')),
  );
  if (numbers.length < 4) return null;

  const weapons = aliases
    .filter(([pattern]) => pattern.test(line))
    .map(([, weapon]) => weapon);
  const firstNumberAt = line.search(/\b\d[\d,.]*\b/);
  const nameRegion = (firstNumberAt >= 0 ? line.slice(0, firstNumberAt) : line)
    .replace(new RegExp(aliases.map(([pattern]) => pattern.source).join('|'), 'gi'), ' ')
    .replace(/[|:_[\]()/\\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Try to detect explicit team color before stripping the name
  const explicitTeam = /\b(blue|red|yellow)\b/i.exec(nameRegion);
  let team: TeamColor = columnIndex === 0 ? TeamColor.BLUE : TeamColor.RED;
  let explicitTeamDetected = false;
  if (explicitTeam) {
    explicitTeamDetected = true;
    const colorStr = explicitTeam[1].toLowerCase();
    if (colorStr === 'blue') team = TeamColor.BLUE;
    if (colorStr === 'red') team = TeamColor.RED;
    if (colorStr === 'yellow') team = TeamColor.YELLOW;
  }
  
  const characterName = nameRegion.replace(/\b(blue|red|yellow)\b/i, '').split(/\s{2,}/)[0]?.trim() ?? '';
  if (!characterName) return null;

  let kills = null, assists = null, damageDealt = null, damageTaken = null, healingDone = null;
  if (numbers.length >= 5) {
    [kills, assists, damageDealt, damageTaken, healingDone] = numbers.slice(-5);
  } else if (numbers.length === 4) {
    [kills, assists, damageDealt, healingDone] = numbers.slice(-4);
  }

  const detectedFields = 5 + Math.min(weapons.length, 2);
  return {
    rank: null,
    characterName,
    team,
    mainWeapon: weapons[0] ?? null,
    offWeapon: weapons[1] ?? null,
    kills,
    assists,
    damageDealt,
    damageTaken,
    healingDone,
    confidence: Math.round((detectedFields / 7) * 100),
    fieldConfidence: {},
    warnings: [],
    confirmed: false,
    _explicitTeam: explicitTeamDetected, // internal flag
  } as VerifiedParticipant & { _explicitTeam?: boolean };
}

function splitScoreboardLine(line: string) {
  const numberMatches = [...line.matchAll(/\b\d[\d,.]*\b/g)];
  if (numberMatches.length < 8) return [line];
  const leftEnd = (numberMatches[3].index ?? 0) + numberMatches[3][0].length;
  return [line.slice(0, leftEnd), line.slice(leftEnd)];
}

export async function extractScoreboard(
  image: File,
  onProgress: (progress: number) => void,
  classes: Array<{ key: string; aliases: string[] }> = [],
  boundaries: ColumnBoundary[] = defaultBoundaries,
): Promise<ScoreboardExtraction> {
  let activePass = 0;
  const preprocessingModes = ['original', 'contrast', 'threshold'] as const;
  const worker = await createWorker('eng', undefined, {
    logger: (message: LoggerMessage) => {
      if (message.status === 'recognizing text') {
        onProgress(Math.round(((activePass + message.progress) / preprocessingModes.length) * 100));
      }
    },
  });

  try {
    const url = URL.createObjectURL(image);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);

    const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
    const scale = longestEdge < minimumOcrEdge ? minimumOcrEdge / longestEdge : longestEdge > maximumOcrEdge ? maximumOcrEdge / longestEdge : 1;
    const scaledWidth = Math.max(1, Math.round(img.naturalWidth * scale));
    const scaledHeight = Math.max(1, Math.round(img.naturalHeight * scale));

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = scaledWidth;
    sourceCanvas.height = scaledHeight;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) throw new Error('Could not create OCR source canvas');
    sourceContext.imageSmoothingEnabled = true;
    sourceContext.imageSmoothingQuality = 'high';
    sourceContext.drawImage(img, 0, 0, scaledWidth, scaledHeight);

    const targetColumns: OcrFieldKey[] = ['rank', 'name', 'team', 'kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'];
    const columnsToOcr = boundaries.filter((boundary): boundary is ColumnBoundary & { key: OcrFieldKey } =>
      targetColumns.includes(boundary.key as OcrFieldKey),
    );
    const stackInfo = columnsToOcr.map((col, index) => {
      const colX = Math.round((col.start / 100) * scaledWidth);
      const colW = Math.round(((col.end - col.start) / 100) * scaledWidth);
      return { key: col.key, y: index * (scaledHeight + 20), h: scaledHeight, w: colW, colX };
    });

    const extractTeamPixels = (rowY: number, rowRadius: number) => {
      const teamBoundary = boundaries.find((boundary) => boundary.key === 'team');
      if (!teamBoundary) return [];
      const x = Math.round((teamBoundary.start / 100) * scaledWidth);
      const width = Math.max(1, Math.round(((teamBoundary.end - teamBoundary.start) / 100) * scaledWidth));
      const y = Math.max(0, Math.round(rowY - rowRadius));
      const height = Math.max(1, Math.min(scaledHeight - y, Math.round(rowRadius * 2)));
      const data = sourceContext.getImageData(x, y, width, height).data;
      const pixels: Array<{ r: number; g: number; b: number }> = [];
      for (let index = 0; index < data.length; index += 16) {
        pixels.push({ r: data[index], g: data[index + 1], b: data[index + 2] });
      }
      return pixels;
    };

    const candidates: ScoreboardExtraction[] = [];
    for (const [passIndex, mode] of preprocessingModes.entries()) {
      activePass = passIndex;
      const stackCanvas = document.createElement('canvas');
      stackCanvas.width = Math.max(...stackInfo.map((info) => info.w));
      stackCanvas.height = stackInfo.length * (scaledHeight + 20);
      const context = stackCanvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Could not create stacked OCR canvas');
      context.fillStyle = 'black';
      context.fillRect(0, 0, stackCanvas.width, stackCanvas.height);

      for (const info of stackInfo) {
        context.drawImage(sourceCanvas, info.colX, 0, info.w, scaledHeight, 0, info.y, info.w, info.h);
      }
      if (mode !== 'original') {
        const imageData = context.getImageData(0, 0, stackCanvas.width, stackCanvas.height);
        for (let index = 0; index < imageData.data.length; index += 4) {
          const luminance =
            imageData.data[index] * 0.2126 +
            imageData.data[index + 1] * 0.7152 +
            imageData.data[index + 2] * 0.0722;
          const adjusted = mode === 'threshold'
            ? (luminance >= 135 ? 255 : 0)
            : Math.max(0, Math.min(255, (luminance - 110) * 1.75 + 128));
          imageData.data[index] = adjusted;
          imageData.data[index + 1] = adjusted;
          imageData.data[index + 2] = adjusted;
        }
        context.putImageData(imageData, 0, 0);
      }

      const stackedBlob = await new Promise<Blob>((resolve, reject) => {
        stackCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to prepare OCR image')), 'image/png');
      });
      const result = await worker.recognize(stackedBlob, {}, { blocks: true, text: true });
      const columnCells: Partial<Record<OcrFieldKey, DetectedCell[]>> = {};
      for (const column of stackInfo) columnCells[column.key] = [];

      const lines = result.data.blocks?.flatMap((block) =>
        block.paragraphs?.flatMap((paragraph) => paragraph.lines),
      ) ?? [];
      for (const line of lines) {
        if (!line) continue;
        const lineCenterY = line.bbox.y0 + (line.bbox.y1 - line.bbox.y0) / 2;
        const matchingColumn = stackInfo.find((column) =>
          lineCenterY >= column.y && lineCenterY < column.y + column.h,
        );
        if (!matchingColumn) continue;
        columnCells[matchingColumn.key]?.push({
          key: matchingColumn.key,
          text: line.text.trim(),
          y: lineCenterY - matchingColumn.y,
          confidence: line.confidence,
        });
      }

      const allCells = Object.values(columnCells).flat();
      const rowTolerance = Math.max(8, scaledHeight / 120);
      const rowAnchors = clusterRowAnchors(allCells, rowTolerance);
      const rowSpacing = rowAnchors.length > 1
        ? rowAnchors.slice(1).reduce((sum, anchor, index) => sum + anchor.y - rowAnchors[index].y, 0) / (rowAnchors.length - 1)
        : scaledHeight / Math.max(1, rowAnchors.length);
      const maximumDistance = Math.max(12, rowSpacing * 0.45);
      const cellAtRow = (key: OcrFieldKey, y: number) => {
        const nearest = (columnCells[key] ?? []).reduce<DetectedCell | null>((best, cell) =>
          !best || Math.abs(cell.y - y) < Math.abs(best.y - y) ? cell : best, null);
        return nearest && Math.abs(nearest.y - y) <= maximumDistance ? nearest : null;
      };

      const participants: VerifiedParticipant[] = [];
      for (const anchor of rowAnchors) {
        const nameCell = cellAtRow('name', anchor.y);
        const characterName = (nameCell?.text ?? '').replace(/\s+/g, ' ').trim();
        const rankCell = cellAtRow('rank', anchor.y);
        const rankResult = cleanNumericCell(rankCell?.text ?? '');

        const teamCell = cellAtRow('team', anchor.y);
        const textTeam = detectTeamFromText(teamCell?.text ?? '');
        const colorTeam = classifyTeamPixels(extractTeamPixels(anchor.y, rowSpacing * 0.3));
        const teamDetection: TeamDetection = textTeam.team ? textTeam : colorTeam;
        const numericFields = ['kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'] as const;
        const numericResults = Object.fromEntries(numericFields.map((field) => [
          field,
          cleanNumericCell(cellAtRow(field, anchor.y)?.text ?? ''),
        ])) as Record<(typeof numericFields)[number], ReturnType<typeof cleanNumericCell>>;
        const fieldConfidence: VerifiedParticipant['fieldConfidence'] = {
          rank: Math.round(rankCell?.confidence ?? 0),
          characterName: Math.round(nameCell?.confidence ?? 0),
          team: teamDetection.confidence,
        };
        const warnings: string[] = [];
        if (!characterName) warnings.push('Character name is missing or unreadable');
        if (!teamDetection.team) warnings.push('Team could not be recognized');
        for (const field of numericFields) {
          const cell = cellAtRow(field, anchor.y);
          const resultForField = numericResults[field];
          fieldConfidence[field] = Math.round(cell?.confidence ?? 0);
          if (resultForField.value === null) warnings.push(`${field} is missing or unreadable`);
          else if (resultForField.corrected) warnings.push(`${field} used an OCR character correction`);
          else if ((cell?.confidence ?? 0) < 65) warnings.push(`${field} has low OCR confidence`);
        }
        if (characterName && (nameCell?.confidence ?? 0) < 65) warnings.push('Character name has low OCR confidence');

        const populatedFields =
          1 +
          (teamDetection.team ? 1 : 0) +
          numericFields.filter((field) => numericResults[field].value !== null).length;
        const confidence = Math.round(
          Object.values(fieldConfidence).reduce((sum, value) => sum + (value ?? 0), 0) / 7,
        );
        participants.push({
          rank: rankResult.value,
          characterName,
          team: teamDetection.team,
          mainWeapon: null,
          offWeapon: null,
          kills: numericResults.kills.value,
          assists: numericResults.assists.value,
          damageDealt: numericResults.damageDealt.value,
          damageTaken: numericResults.damageTaken.value,
          healingDone: numericResults.healingDone.value,
          confidence,
          fieldConfidence,
          warnings,
          confirmed: false,
        });
        Object.assign(participants.at(-1)!, { _populatedFields: populatedFields });
      }

      const candidateRows = participants.map((participant) => ({
        characterName: participant.characterName,
        populatedFields: (participant as VerifiedParticipant & { _populatedFields?: number })._populatedFields ?? 0,
        confidence: participant.confidence,
      }));
      for (const participant of participants as Array<VerifiedParticipant & { _populatedFields?: number }>) {
        delete participant._populatedFields;
      }
      const fieldConfidence = participants.length
        ? participants.reduce((sum, participant) => sum + participant.confidence, 0) / participants.length
        : 0;
      candidates.push({
        participants,
        confidence: Math.round((fieldConfidence + result.data.confidence) / 2),
        rawText: result.data.text,
        preprocessing: mode,
        _score: scoreExtractionCandidate(candidateRows, result.data.confidence),
      } as ScoreboardExtraction & { _score: number });
    }

    onProgress(100);
    const best = candidates.sort((left, right) =>
      ((right as ScoreboardExtraction & { _score?: number })._score ?? 0) -
      ((left as ScoreboardExtraction & { _score?: number })._score ?? 0),
    )[0];
    if (!best) return { participants: [], confidence: 0, rawText: '', preprocessing: 'original' };
    delete (best as ScoreboardExtraction & { _score?: number })._score;
    return best;
  } finally {
    await worker.terminate();
  }
}

async function prepareImageForOcr(file: File): Promise<File | Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const longestEdge = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestEdge < minimumOcrEdge
      ? minimumOcrEdge / longestEdge
      : longestEdge > maximumOcrEdge
        ? maximumOcrEdge / longestEdge
        : 1;
    if (scale === 1) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The scoreboard image could not be prepared for OCR.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('The scoreboard image could not be prepared for OCR.')),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function parseScoreboardText(
  rawText: string,
  ocrConfidence: number,
  classes: Array<{ key: string; aliases: string[] }> = [],
): ScoreboardExtraction {
  const aliases: Array<[RegExp, string]> = classes.length
    ? classes.flatMap((entry) => entry.aliases.length ? entry.aliases.map((alias) => [new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i'), entry.key] as [RegExp, string]) : [[new RegExp(`\\b${entry.key.replaceAll('_', '[ _-]')}\\b`, 'i'), entry.key] as [RegExp, string]])
    : weaponAliases;
  const rowsByLine = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      splitScoreboardLine(line)
        .map((segment, segmentIndex) => parseLine(segment.trim(), segmentIndex, aliases))
        .filter((entry): entry is VerifiedParticipant => entry !== null),
    );
  const leftColumn = rowsByLine.map((rows) => rows[0]).filter(Boolean) as (VerifiedParticipant & { _explicitTeam?: boolean })[];
  const rightColumn = rowsByLine.map((rows) => rows[1]).filter(Boolean) as (VerifiedParticipant & { _explicitTeam?: boolean })[];
  const participants = rightColumn.length > 0
    ? [
        ...leftColumn.slice(0, 48).map((entry) => ({ ...entry, team: entry._explicitTeam ? entry.team : TeamColor.BLUE })),
        ...rightColumn.slice(0, 48).map((entry) => ({ ...entry, team: entry._explicitTeam ? entry.team : TeamColor.RED })),
      ]
    : leftColumn.slice(0, 96).map((entry, index, rows) => ({
        ...entry,
        team: entry._explicitTeam ? entry.team : (index < Math.ceil(rows.length / 2) ? TeamColor.BLUE : TeamColor.RED),
      }));
      
  // remove _explicitTeam from output
  for (const p of participants as any[]) {
    delete p._explicitTeam;
  }
  const fieldConfidence =
    participants.length > 0
      ? participants.reduce((sum, participant) => sum + participant.confidence, 0) /
        participants.length
      : 0;
  return {
    participants,
    confidence: Math.round((fieldConfidence + ocrConfidence) / 2),
    rawText,
    preprocessing: 'original',
  };
}

export async function readImageDimensions(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}