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
  damageTaken: number | null;
  healingDone: number | null;
  confidence: number;
  confirmed: boolean;
};

export type ScoreboardExtraction = {
  participants: VerifiedParticipant[];
  confidence: number;
  rawText: string;
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
  const worker = await createWorker('eng', undefined, {
    logger: (message: LoggerMessage) => {
      if (message.status === 'recognizing text') onProgress(Math.round(message.progress * 100));
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
    
    const targetColumns = ['rank', 'name', 'team', 'kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'];
    const columnsToOcr = boundaries.filter((b) => targetColumns.includes(b.key));
    
    let currentY = 0;
    const stackInfo = columnsToOcr.map((col) => {
      const colX = Math.round((col.start / 100) * scaledWidth);
      const colW = Math.round(((col.end - col.start) / 100) * scaledWidth);
      const info = { key: col.key, y: currentY, h: scaledHeight, w: colW, colX };
      currentY += scaledHeight + 20; // 20px black gap to prevent cross-column bleed
      return info;
    });
    
    const stackCanvas = document.createElement('canvas');
    stackCanvas.width = Math.max(...stackInfo.map(i => i.w));
    stackCanvas.height = currentY;
    
    const ctx = stackCanvas.getContext('2d');
    if (!ctx) throw new Error('Could not create stacked OCR canvas');
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, stackCanvas.width, stackCanvas.height);
    
    for (const info of stackInfo) {
      const sx = info.colX / scale;
      const sy = 0;
      const sWidth = info.w / scale;
      const sHeight = img.naturalHeight;
      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, info.y, info.w, info.h);
    }
    
    const stackedBlob = await new Promise<Blob>((resolve, reject) => {
      stackCanvas.toBlob((b) => b ? resolve(b) : reject(new Error('Failed to blob')), 'image/png');
    });
    
    const result = await worker.recognize(stackedBlob, {}, { blocks: true, text: true });
    
    type DetectedCell = { text: string; y: number; confidence: number };
    const columnCells: Record<string, DetectedCell[]> = {};
    for (const col of stackInfo) {
      columnCells[col.key] = [];
    }
    
    const lines = result.data.blocks?.flatMap(b => b.paragraphs?.flatMap(p => p.lines)) || [];
    
    // Group Tesseract lines by their vertical position in the stack
    for (const line of lines) {
      if (!line) continue;
      const lineCenterY = line.bbox.y0 + (line.bbox.y1 - line.bbox.y0) / 2;
      const matchingCol = stackInfo.find(c => lineCenterY >= c.y && lineCenterY < c.y + c.h);
      if (matchingCol) {
        columnCells[matchingCol.key].push({
          text: line.text.trim(),
          y: lineCenterY - matchingCol.y,
          confidence: line.confidence,
        });
      }
    }
    
    const cleanNumber = (text: string) => {
      const digits = text.replace(/[^\d]/g, '');
      return digits.length > 0 ? Number(digits) : null;
    };
    
    const cleanString = (text: string) => text.replace(/\s+/g, ' ').trim();
    
    const rankCells = (columnCells.rank ?? []).filter((cell) => cleanNumber(cell.text) !== null);
    const rowAnchors = rankCells.length ? rankCells : (columnCells.name ?? []);
    const rowSpacing = rowAnchors.length > 1
      ? rowAnchors.slice(1).reduce((sum, cell, index) => sum + cell.y - rowAnchors[index].y, 0) / (rowAnchors.length - 1)
      : scaledHeight / Math.max(1, rowAnchors.length);
    const maximumDistance = Math.max(12, rowSpacing * 0.55);
    const cellAtRow = (key: string, y: number) => {
      const nearest = (columnCells[key] ?? []).reduce<DetectedCell | null>((best, cell) =>
        !best || Math.abs(cell.y - y) < Math.abs(best.y - y) ? cell : best, null);
      return nearest && Math.abs(nearest.y - y) <= maximumDistance ? nearest : null;
    };
    
    const participants: VerifiedParticipant[] = [];
    let confidenceSum = 0;
    
    for (const anchor of rowAnchors) {
      const nameCell = cellAtRow('name', anchor.y);
      const name = cleanString(nameCell?.text ?? '');
      if (!name) continue;
      
      const teamCell = cellAtRow('team', anchor.y);
      const teamText = cleanString(teamCell?.text ?? '').toLowerCase();
      let team: TeamColor = TeamColor.BLUE;
      if (teamText.includes('red')) team = TeamColor.RED;
      if (teamText.includes('yellow') || teamText.includes('yel')) team = TeamColor.YELLOW;
      
      const kills = cleanNumber(cellAtRow('kills', anchor.y)?.text ?? '');
      const assists = cleanNumber(cellAtRow('assists', anchor.y)?.text ?? '');
      const damageDealt = cleanNumber(cellAtRow('damageDealt', anchor.y)?.text ?? '');
      const damageTaken = cleanNumber(cellAtRow('damageTaken', anchor.y)?.text ?? '');
      const healingDone = cleanNumber(cellAtRow('healingDone', anchor.y)?.text ?? '');
      
      let detectedFields = 1;
      if (teamCell && /\b(blue|red|yellow|yel)/i.test(teamCell.text)) detectedFields++;
      if (kills !== null) detectedFields++;
      if (assists !== null) detectedFields++;
      if (damageDealt !== null) detectedFields++;
      if (damageTaken !== null) detectedFields++;
      if (healingDone !== null) detectedFields++;
      
      const rowConfidence = Math.round((detectedFields / 7) * 100);
      confidenceSum += rowConfidence;
      
      participants.push({
        characterName: name,
        team,
        mainWeapon: null,
        offWeapon: null,
        kills,
        assists,
        damageDealt,
        damageTaken,
        healingDone,
        confidence: rowConfidence,
        confirmed: false,
      });
    }
    
    const fieldConfidence = participants.length > 0 ? confidenceSum / participants.length : 0;
    return {
      participants,
      confidence: Math.round((fieldConfidence + result.data.confidence) / 2),
      rawText: result.data.text,
    };
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