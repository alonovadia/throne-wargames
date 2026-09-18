import { createWorker, type LoggerMessage } from 'tesseract.js';
import { TeamColor } from '@workspace/api-client-react';

export type VerifiedParticipant = {
  characterName: string;
  team: TeamColor;
  mainWeapon: string | null;
  offWeapon: string | null;
  kills: number | null;
  assists: number | null;
  damageDealt: number | null;
  healingDone: number | null;
  confidence: number;
  confirmed: boolean;
};

export type ScoreboardExtraction = {
  participants: VerifiedParticipant[];
  confidence: number;
  rawText: string;
};

const weaponAliases: Array<[RegExp, string]> = [
  [/\b(great\s*sword|gs)\b/i, 'GREATSWORD'],
  [/\b(sword\s*(and|&)\s*shield|sns|swordshield)\b/i, 'SWORD_AND_SHIELD'],
  [/\b(cross\s*bow|xbow)\b/i, 'CROSSBOW'],
  [/\b(long\s*bow|bow)\b/i, 'LONGBOW'],
  [/\bdagger(s)?\b/i, 'DAGGER'],
  [/\bstaff\b/i, 'STAFF'],
  [/\bwand\b/i, 'WAND'],
];

function parseLine(line: string, index: number, aliases = weaponAliases): VerifiedParticipant | null {
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
  const characterName = nameRegion.split(/\s{2,}/)[0]?.trim() ?? '';
  if (!characterName) return null;

  const stats = numbers.slice(-4);
  const detectedFields = 5 + Math.min(weapons.length, 2);
  return {
    characterName,
    team: index < 6 ? TeamColor.BLUE : TeamColor.RED,
    mainWeapon: weapons[0] ?? null,
    offWeapon: weapons[1] ?? null,
    kills: stats[0] ?? null,
    assists: stats[1] ?? null,
    damageDealt: stats[2] ?? null,
    healingDone: stats[3] ?? null,
    confidence: Math.round((detectedFields / 7) * 100),
    confirmed: false,
  };
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
): Promise<ScoreboardExtraction> {
  const worker = await createWorker('eng', undefined, {
    logger: (message: LoggerMessage) => {
      if (message.status === 'recognizing text') onProgress(Math.round(message.progress * 100));
    },
  });
  try {
    const result = await worker.recognize(image);
    return parseScoreboardText(result.data.text, result.data.confidence, classes);
  } finally {
    await worker.terminate();
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
  const leftColumn = rowsByLine.map((rows) => rows[0]).filter(Boolean);
  const rightColumn = rowsByLine.map((rows) => rows[1]).filter(Boolean);
  const parsed =
    rightColumn.length > 0
      ? [...leftColumn.slice(0, 6), ...rightColumn.slice(0, 6)]
      : leftColumn.slice(0, 12);
  const participants = parsed.map((entry, index) => ({
    ...entry,
    team: index < 6 ? TeamColor.BLUE : TeamColor.RED,
  }));
  const fieldConfidence =
    participants.length > 0
      ? participants.reduce((sum, participant) => sum + participant.confidence, 0) /
        participants.length
      : 0;
  return {
    participants,
    confidence: Math.round((fieldConfidence + ocrConfidence) / 2),
    rawText,
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