import { createWorker, PSM, type LoggerMessage } from 'tesseract.js';
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
import {
  createIconSignature,
  type IconSignature,
} from './weapon-icon-recognition';

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
  weaponEvidence: Array<{ main: IconSignature; off: IconSignature } | null>;
};

type ExtractionCandidate = ScoreboardExtraction & {
  _score: number;
  _rowAnchors: number[];
  _columnCells: Partial<Record<OcrFieldKey, DetectedCell[]>>;
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
const numericOcrFields = new Set<OcrFieldKey>([
  'rank',
  'kills',
  'assists',
  'damageDealt',
  'damageTaken',
  'healingDone',
]);
const numericWhitelist = '0123456789OoQqIl|SsBbZzGgTt,.';

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
  const leadingRank = /^\s*(\d{1,3})(?=\s|$)/.exec(line);
  const lineWithoutLeadingRank = leadingRank ? line.slice(leadingRank[0].length).trim() : line;
  const numbers = [...lineWithoutLeadingRank.matchAll(/\b\d[\d,.]*\b/g)].map((match) =>
    Number(match[0].replace(/[,.]/g, '')),
  );
  if (numbers.length < 4) return null;

  const weapons = aliases
    .filter(([pattern]) => pattern.test(line))
    .map(([, weapon]) => weapon);
  const firstNumberAt = lineWithoutLeadingRank.search(/\b\d[\d,.]*\b/);
  const nameRegion = (firstNumberAt >= 0 ? lineWithoutLeadingRank.slice(0, firstNumberAt) : lineWithoutLeadingRank)
    .replace(new RegExp(aliases.map(([pattern]) => pattern.source).join('|'), 'gi'), ' ')
    .replace(/[|:*+_[\]()/\\-]+/g, ' ')
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
    rank: leadingRank ? Number(leadingRank[1]) : null,
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

function cleanRankCell(text: string) {
  const compact = text.replace(/[\s,.'’`]/g, '');
  if (/^n$/i.test(compact)) return { value: 11, corrected: true };
  if (/^[lIaA|]+$/.test(compact) && compact.length <= 3) {
    if (compact.length === 2) return { value: 11, corrected: true };
    return { value: null, corrected: false };
  }
  return cleanNumericCell(text);
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
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
      tessedit_char_whitelist: '',
    });
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
      const edgeMargin = col.key === 'rank' ? 3 : 0.65;
      const start = Math.min(col.end - 0.1, Math.max(0, col.start + edgeMargin));
      const end = Math.max(start + 0.1, Math.min(100, col.end - edgeMargin));
      const colX = Math.round((start / 100) * scaledWidth);
      const colW = Math.max(1, Math.round(((end - start) / 100) * scaledWidth));
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

    const extractWeaponEvidence = (rowY: number, rowRadius: number) => {
      const weaponBoundary = boundaries.find((boundary) => boundary.key === 'weapons');
      if (!weaponBoundary) return null;
      const x = Math.round((weaponBoundary.start / 100) * scaledWidth);
      const width = Math.max(2, Math.round(((weaponBoundary.end - weaponBoundary.start) / 100) * scaledWidth));
      const y = Math.max(0, Math.round(rowY - rowRadius));
      const height = Math.max(1, Math.min(scaledHeight - y, Math.round(rowRadius * 2)));
      const imageData = sourceContext.getImageData(x, y, width, height);
      const halfWidth = Math.max(1, Math.floor(width / 2));
      const mainPixels: number[] = [];
      const offPixels: number[] = [];
      for (let pixelY = 0; pixelY < height; pixelY += 1) {
        for (let pixelX = 0; pixelX < width; pixelX += 1) {
          const sourceIndex = (pixelY * width + pixelX) * 4;
          const destination = pixelX < halfWidth ? mainPixels : offPixels;
          destination.push(
            imageData.data[sourceIndex],
            imageData.data[sourceIndex + 1],
            imageData.data[sourceIndex + 2],
            imageData.data[sourceIndex + 3],
          );
        }
      }
      return {
        main: createIconSignature(mainPixels, halfWidth, height),
        off: createIconSignature(offPixels, width - halfWidth, height),
      };
    };

    const candidates: ExtractionCandidate[] = [];
    for (const [passIndex, mode] of preprocessingModes.entries()) {
      activePass = passIndex;
      const createStackBlob = async (
        infos: Array<(typeof stackInfo)[number]>,
        fillMode: typeof mode,
      ) => {
        const stackCanvas = document.createElement('canvas');
        stackCanvas.width = Math.max(...infos.map((info) => info.w));
        stackCanvas.height = infos.length * (scaledHeight + 20);
        const context = stackCanvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Could not create stacked OCR canvas');
        context.fillStyle = 'black';
        context.fillRect(0, 0, stackCanvas.width, stackCanvas.height);

        for (const info of infos) {
          context.drawImage(sourceCanvas, info.colX, 0, info.w, scaledHeight, 0, info.y, info.w, info.h);
        }
        if (fillMode !== 'original') {
          const imageData = context.getImageData(0, 0, stackCanvas.width, stackCanvas.height);
          for (let index = 0; index < imageData.data.length; index += 4) {
            const luminance =
              imageData.data[index] * 0.2126 +
              imageData.data[index + 1] * 0.7152 +
              imageData.data[index + 2] * 0.0722;
            const adjusted = fillMode === 'threshold'
              ? (luminance >= 135 ? 255 : 0)
              : Math.max(0, Math.min(255, (luminance - 110) * 1.75 + 128));
            imageData.data[index] = adjusted;
            imageData.data[index + 1] = adjusted;
            imageData.data[index + 2] = adjusted;
          }
          context.putImageData(imageData, 0, 0);
        }

        return await new Promise<Blob>((resolve, reject) => {
          stackCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to prepare stacked OCR image')), 'image/png');
        });
      };

      const readCells = (
        result: Awaited<ReturnType<typeof worker.recognize>>,
        infos: Array<(typeof stackInfo)[number]>,
      ) => {
        const cells: Partial<Record<OcrFieldKey, DetectedCell[]>> = {};
        for (const column of infos) cells[column.key] = [];
        const lines = result.data.blocks?.flatMap((block) =>
          block.paragraphs?.flatMap((paragraph) => paragraph.lines),
        ) ?? [];
        for (const line of lines) {
          if (!line) continue;
          const lineCenterY = line.bbox.y0 + (line.bbox.y1 - line.bbox.y0) / 2;
          const matchingColumn = infos.find((column) =>
            lineCenterY >= column.y && lineCenterY < column.y + column.h,
          );
          if (!matchingColumn) continue;
          cells[matchingColumn.key]?.push({
            key: matchingColumn.key,
            text: line.text.trim(),
            y: lineCenterY - matchingColumn.y,
            confidence: line.confidence,
          });
        }
        return cells;
      };

      const stackedBlob = await createStackBlob(stackInfo, mode);
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
        tessedit_char_whitelist: '',
      });
      const result = await worker.recognize(stackedBlob, {}, { blocks: true, text: true });
      const columnCells = readCells(result, stackInfo);

      const numericStackInfo = stackInfo
        .filter((info) => numericOcrFields.has(info.key))
        .map((info, index) => ({
          ...info,
          y: index * (scaledHeight + 20),
        }));
      const numericStackBlob = await createStackBlob(numericStackInfo, mode);
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
        tessedit_char_whitelist: numericWhitelist,
        preserve_interword_spaces: '0',
      });
      const numericResult = await worker.recognize(numericStackBlob, {}, { blocks: true, text: true });
      const numericCells = readCells(numericResult, numericStackInfo);
      for (const key of numericOcrFields) {
        columnCells[key] = numericCells[key] ?? [];
      }

      const rowAnchorFields: OcrFieldKey[] = ['name', 'team', 'kills', 'assists', 'damageDealt'];
      const allCells = rowAnchorFields
        .flatMap((key) => columnCells[key] ?? [])
        .filter((cell) => cell.key !== 'name' || /[a-z0-9]/i.test(cell.text));
      const rowTolerance = Math.max(8, scaledHeight / 120);
      const rawRowAnchors = clusterRowAnchors(allCells, rowTolerance);
      const rawGaps = rawRowAnchors.slice(1).map((anchor, index) => anchor.y - rawRowAnchors[index].y);
      const sortedGaps = [...rawGaps].sort((left, right) => left - right);
      const dominantSpacing = sortedGaps.length
        ? sortedGaps[Math.floor(sortedGaps.length / 2)]
        : scaledHeight;
      const rowAnchors = rawRowAnchors.reduce<typeof rawRowAnchors>((anchors, anchor) => {
        const previous = anchors.at(-1);
        if (!previous || anchor.y - previous.y >= dominantSpacing * 0.65) {
          anchors.push(anchor);
        } else if (
          anchor.support > previous.support ||
          (anchor.keys.includes('name') && !previous.keys.includes('name'))
        ) {
          anchors[anchors.length - 1] = anchor;
        }
        return anchors;
      }, []);
      const rowSpacing = rowAnchors.length > 1
        ? rowAnchors.slice(1).reduce((sum, anchor, index) => sum + anchor.y - rowAnchors[index].y, 0) / (rowAnchors.length - 1)
        : scaledHeight / Math.max(1, rowAnchors.length);
      const maximumDistance = Math.max(12, rowSpacing * 0.45);
      const cellAtRow = (key: OcrFieldKey, y: number) => {
        const nearest = (columnCells[key] ?? []).reduce<DetectedCell | null>((best, cell) =>
          !best || Math.abs(cell.y - y) < Math.abs(best.y - y) ? cell : best, null);
        return nearest && Math.abs(nearest.y - y) <= maximumDistance ? nearest : null;
      };

      const focusedNumericCells = new Map<string, { result: ReturnType<typeof cleanNumericCell>; confidence: number }>();
      const rankInfo = stackInfo.find((info) => info.key === 'rank');
      const focusedFields: OcrFieldKey[] = ['rank', 'kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'];
      if (rankInfo && rowAnchors.length > 0) {
        const cropHeight = Math.max(24, Math.min(scaledHeight, Math.round(rowSpacing * 0.72)));
        const cropGap = 10;
        const focusedInfos = focusedFields.flatMap((key) => {
          const info = stackInfo.find((entry) => entry.key === key);
          if (!info) return [];
          return rowAnchors.map((anchor, rowIndex) => ({
            key,
            rowIndex,
            colX: info.colX,
            w: info.w,
            sourceY: Math.max(0, Math.min(scaledHeight - cropHeight, Math.round(anchor.y - cropHeight / 2))),
            destinationY: (focusedFields.indexOf(key) * rowAnchors.length + rowIndex) * (cropHeight + cropGap),
          }));
        });
        const focusedCanvas = document.createElement('canvas');
        focusedCanvas.width = Math.max(...focusedInfos.map((info) => info.w));
        focusedCanvas.height = focusedFields.length * rowAnchors.length * (cropHeight + cropGap);
        const focusedContext = focusedCanvas.getContext('2d', { willReadFrequently: true });
        if (focusedContext) {
          focusedContext.fillStyle = 'black';
          focusedContext.fillRect(0, 0, focusedCanvas.width, focusedCanvas.height);
          for (const info of focusedInfos) {
            focusedContext.drawImage(
              sourceCanvas,
              info.colX,
              info.sourceY,
              info.w,
              cropHeight,
              0,
              info.destinationY,
              info.w,
              cropHeight,
            );
          }
          if (mode !== 'original') {
            const imageData = focusedContext.getImageData(0, 0, focusedCanvas.width, focusedCanvas.height);
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
            focusedContext.putImageData(imageData, 0, 0);
          }
          const focusedBlob = await new Promise<Blob>((resolve, reject) => {
            focusedCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Failed to prepare focused OCR image')), 'image/png');
          });
          await worker.setParameters({
            tessedit_pageseg_mode: PSM.SINGLE_LINE,
            tessedit_char_whitelist: numericWhitelist,
            preserve_interword_spaces: '0',
          });
          const focusedResult = await worker.recognize(focusedBlob, {}, { blocks: true, text: true });
          const focusedLines = focusedResult.data.blocks?.flatMap((block) =>
            block.paragraphs?.flatMap((paragraph) => paragraph.lines),
          ) ?? [];
          for (const line of focusedLines) {
            if (!line) continue;
            const stripIndex = Math.floor(line.bbox.y0 / (cropHeight + cropGap));
            const info = focusedInfos[stripIndex];
            if (!info) continue;
            const key = `${info.key}:${info.rowIndex}`;
            const next = {
              result: info.key === 'rank'
                ? cleanRankCell(line.text.trim())
                : cleanNumericCell(line.text.trim()),
              confidence: line.confidence,
            };
            const previous = focusedNumericCells.get(key);
            if (!previous || next.confidence > previous.confidence) focusedNumericCells.set(key, next);
          }
        }
      }

      const participants: VerifiedParticipant[] = [];
      const weaponEvidence: Array<{ main: IconSignature; off: IconSignature } | null> = [];
      for (const [rowIndex, anchor] of rowAnchors.entries()) {
        const nameCell = cellAtRow('name', anchor.y);
        const characterName = (nameCell?.text ?? '').replace(/\s+/g, ' ').trim();
        const rankCell = cellAtRow('rank', anchor.y);
        const focusedRank = focusedNumericCells.get(`rank:${rowIndex}`);
        const rankResult = focusedRank && (rankCell === null || focusedRank.confidence > (rankCell.confidence ?? 0))
          ? focusedRank.result
          : cleanRankCell(rankCell?.text ?? '');

        const teamCell = cellAtRow('team', anchor.y);
        const textTeam = detectTeamFromText(teamCell?.text ?? '');
        const colorTeam = classifyTeamPixels(extractTeamPixels(anchor.y, rowSpacing * 0.3));
        const teamDetection: TeamDetection = textTeam.team ? textTeam : colorTeam;
        const numericFields = ['kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'] as const;
        const numericResults = Object.fromEntries(numericFields.map((field) => [
          field,
          (() => {
            const cell = cellAtRow(field, anchor.y);
            const focused = focusedNumericCells.get(`${field}:${rowIndex}`);
            if (focused && (cell === null || focused.confidence > (cell.confidence ?? 0))) {
              return focused.result;
            }
            return cleanNumericCell(cell?.text ?? '');
          })(),
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
          Object.values(fieldConfidence).reduce((sum, value) => sum + (value ?? 0), 0) / 8,
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
        weaponEvidence.push(extractWeaponEvidence(anchor.y, rowSpacing * 0.42));
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
        weaponEvidence,
        _rowAnchors: rowAnchors.map((anchor) => anchor.y),
        _columnCells: columnCells,
        _score: scoreExtractionCandidate(candidateRows, result.data.confidence),
      });
    }

    onProgress(100);
    const rankedCandidates = candidates.sort((left, right) => right._score - left._score);
    const best = rankedCandidates.find((candidate) =>
      candidate.preprocessing === 'contrast' &&
      candidate.participants.length === rankedCandidates[0]?.participants.length,
    ) ?? rankedCandidates[0];
    if (!best) return { participants: [], confidence: 0, rawText: '', preprocessing: 'original', weaponEvidence: [] };
    const fields: ParticipantField[] = [
      'rank',
      'characterName',
      'team',
      'kills',
      'assists',
      'damageDealt',
      'damageTaken',
      'healingDone',
    ];
    best.participants = best.participants.map((participant, rowIndex) => {
      const merged = {
        ...participant,
        fieldConfidence: { ...participant.fieldConfidence },
        warnings: [...participant.warnings],
      };
      const bestRowY = best._rowAnchors[rowIndex];
      const alignmentTolerance = Math.max(
        12,
        (scaledHeight / Math.max(1, best.participants.length)) * 0.55,
      );
      for (const field of fields) {
        const current = merged[field];
        const currentEmpty = current === null || current === '';
        const currentConfidence = merged.fieldConfidence[field] ?? 0;
        const cellKey = field === 'characterName' ? 'name' : field as OcrFieldKey;
        const alternatives: Array<{ value: string | number; confidence: number }> = [];
        for (const candidate of candidates) {
          if (candidate === best) continue;
          const cells = candidate._columnCells[cellKey] ?? [];
          const cell = cells.reduce<DetectedCell | null>((nearest, next) =>
            !nearest || Math.abs(next.y - bestRowY) < Math.abs(nearest.y - bestRowY)
              ? next
              : nearest, null);
          if (!cell || Math.abs(cell.y - bestRowY) > alignmentTolerance) continue;
          if (field === 'characterName') {
            const value = cell.text.replace(/\s+/g, ' ').trim();
            if (value) alternatives.push({ value, confidence: cell.confidence });
            continue;
          }
          if (field === 'team') {
            const detection = detectTeamFromText(cell.text);
            if (detection.team) alternatives.push({ value: detection.team, confidence: detection.confidence });
            continue;
          }
          const result = field === 'rank'
            ? cleanRankCell(cell.text)
            : cleanNumericCell(cell.text);
          if (result.value !== null) alternatives.push({ value: result.value, confidence: cell.confidence });
        }
        const alternative = alternatives.sort((left, right) => right.confidence - left.confidence)[0];
        if (!alternative) continue;
        const alternativeConfidence = alternative.confidence;
        const hasCorrectionWarning = merged.warnings.some((warning) => warning.startsWith(field) && warning.includes('correction'));
        const mayReplaceCurrent =
          best.preprocessing !== 'contrast' &&
          alternativeConfidence > currentConfidence + 10;
        if (currentEmpty || hasCorrectionWarning || mayReplaceCurrent) {
          merged[field] = alternative.value as never;
          merged.fieldConfidence[field] = alternativeConfidence;
          if (currentEmpty) {
            const warning = `${field} was recovered from another OCR pass; verify it`;
            if (!merged.warnings.includes(warning)) merged.warnings.push(warning);
          }
        }
      }
      return merged;
    });
    const observedOffsets = best.participants
      .map((participant, index) => participant.rank === null ? null : participant.rank - index)
      .filter((offset): offset is number => offset !== null);
    if (observedOffsets.length >= 1) {
      const offsetCounts = new Map<number, number>();
      for (const offset of observedOffsets) offsetCounts.set(offset, (offsetCounts.get(offset) ?? 0) + 1);
      const orderedOffset = [...offsetCounts.entries()].sort((left, right) => right[1] - left[1])[0];
      if (orderedOffset && orderedOffset[1] >= 1) {
        best.participants = best.participants.map((participant, index) => {
          const inferredRank = index + orderedOffset[0];
          if (inferredRank < 1) return participant;
          if (participant.rank !== null && participant.rank - index === orderedOffset[0]) return participant;
          return {
            ...participant,
            rank: inferredRank,
            fieldConfidence: { ...participant.fieldConfidence, rank: 60 },
            warnings: [...participant.warnings, 'Rank inferred from adjacent ordered rows'],
          };
        });
      }
    }
    const completed = best as ScoreboardExtraction & {
      _score?: number;
      _rowAnchors?: number[];
      _columnCells?: Partial<Record<OcrFieldKey, DetectedCell[]>>;
    };
    delete completed._score;
    delete completed._rowAnchors;
    delete completed._columnCells;
    return completed;
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

const mergeableParticipantFields = [
  'rank',
  'characterName',
  'team',
  'kills',
  'assists',
  'damageDealt',
  'damageTaken',
  'healingDone',
] as const;

function normalizedParticipantName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

const participantMergeFields = [
  'rank',
  'characterName',
  'team',
  'mainWeapon',
  'offWeapon',
  'kills',
  'assists',
  'damageDealt',
  'damageTaken',
  'healingDone',
] as const;

type ParticipantMergeField = typeof participantMergeFields[number];

function isEmptyParticipantField(value: VerifiedParticipant[ParticipantMergeField]) {
  return value === null || (typeof value === 'string' && value.trim() === '');
}

function participantFieldConfidence(
  participant: VerifiedParticipant,
  field: ParticipantMergeField,
) {
  if (field === 'mainWeapon' || field === 'offWeapon') return participant.confidence;
  return participant.fieldConfidence[field] ?? participant.confidence;
}

function mergeDuplicateParticipant(
  current: VerifiedParticipant,
  incoming: VerifiedParticipant,
): VerifiedParticipant {
  const merged: VerifiedParticipant = {
    ...current,
    fieldConfidence: { ...current.fieldConfidence },
    warnings: [...current.warnings],
    confirmed: false,
  };

  for (const field of participantMergeFields) {
    const currentValue = merged[field];
    const incomingValue = incoming[field];
    if (isEmptyParticipantField(currentValue) && !isEmptyParticipantField(incomingValue)) {
      merged[field] = incomingValue as never;
      continue;
    }
    if (
      !isEmptyParticipantField(currentValue) &&
      !isEmptyParticipantField(incomingValue) &&
      participantFieldConfidence(incoming, field) > participantFieldConfidence(merged, field) + 5
    ) {
      merged[field] = incomingValue as never;
    }
    if (field !== 'mainWeapon' && field !== 'offWeapon') {
      const currentConfidence = merged.fieldConfidence[field] ?? 0;
      const incomingConfidence = incoming.fieldConfidence[field] ?? 0;
      if (incomingConfidence > currentConfidence) {
        merged.fieldConfidence[field] = incomingConfidence;
      }
    }
  }

  merged.confidence = Math.max(current.confidence, incoming.confidence);
  for (const warning of incoming.warnings) appendWarning(merged, warning);
  return merged;
}

function participantIdentityKey(participant: VerifiedParticipant, fallback: string) {
  if (participant.rank !== null) return `rank:${participant.rank}`;
  const name = normalizedParticipantName(participant.characterName);
  return name ? `name:${name}` : fallback;
}

export function mergeOcrParticipants(extractions: ScoreboardExtraction[]) {
  const participants: VerifiedParticipant[] = [];
  const indexes = new Map<string, number>();
  let duplicateCount = 0;

  extractions.forEach((extraction, extractionIndex) => {
    extraction.participants.forEach((participant, participantIndex) => {
      const key = participantIdentityKey(
        participant,
        `unkeyed:${extractionIndex}:${participantIndex}`,
      );
      const existingIndex = indexes.get(key);
      if (existingIndex === undefined) {
        indexes.set(key, participants.length);
        participants.push({ ...participant, warnings: [...participant.warnings] });
        return;
      }

      duplicateCount += 1;
      participants[existingIndex] = mergeDuplicateParticipant(
        participants[existingIndex],
        participant,
      );
    });
  });

  participants.sort((left, right) => {
    if (left.rank === null && right.rank === null) return 0;
    if (left.rank === null) return 1;
    if (right.rank === null) return -1;
    return left.rank - right.rank;
  });

  return { participants, duplicateCount };
}

function appendWarning(participant: VerifiedParticipant, warning: string) {
  if (!participant.warnings.includes(warning)) participant.warnings.push(warning);
}

export function mergeExternalOcr(
  local: ScoreboardExtraction,
  external: ScoreboardExtraction,
): ScoreboardExtraction {
  if (!local.participants.length) {
    return {
      ...external,
      participants: external.participants.map((participant) => ({
        ...participant,
        warnings: [...participant.warnings, 'Row supplied by external OCR; verify against the screenshot'],
      })),
      preprocessing: local.preprocessing,
      weaponEvidence: local.weaponEvidence,
    };
  }

  const participants = local.participants.map((localParticipant) => {
    const externalParticipant = external.participants.find((candidate) =>
      (localParticipant.rank !== null &&
        candidate.rank !== null &&
        localParticipant.rank === candidate.rank) ||
      (normalizedParticipantName(localParticipant.characterName) &&
        normalizedParticipantName(localParticipant.characterName) === normalizedParticipantName(candidate.characterName)),
    );
    if (!externalParticipant) return { ...localParticipant, warnings: [...localParticipant.warnings] };

    const merged = {
      ...localParticipant,
      fieldConfidence: { ...localParticipant.fieldConfidence },
      warnings: [...localParticipant.warnings],
    };
    for (const field of mergeableParticipantFields) {
      const localValue = merged[field];
      const externalValue = externalParticipant[field];
      if ((localValue === null || (field === 'characterName' && localValue === '')) && externalValue !== null && externalValue !== '') {
        merged[field] = externalValue as never;
        if (field === 'characterName' || field === 'team') {
          merged.fieldConfidence[field] = Math.min(60, merged.fieldConfidence[field] ?? 60);
        } else if (field !== 'rank') {
          merged.fieldConfidence[field] = Math.min(60, merged.fieldConfidence[field] ?? 60);
        }
        appendWarning(merged, `${field} was suggested by external OCR; verify it`);
      } else if (
        localValue !== null &&
        localValue !== '' &&
        externalValue !== null &&
        externalValue !== '' &&
        localValue !== externalValue
      ) {
        appendWarning(merged, `${field} disagrees with external OCR; verify it`);
      }
    }
    return merged;
  });

  return {
    ...local,
    participants,
    rawText: `${local.rawText}\n\n[External OCR]\n${external.rawText}`,
    confidence: Math.min(local.confidence, external.confidence || local.confidence),
    preprocessing: local.preprocessing,
  };
}

export function parseScoreboardText(
  rawText: string,
  ocrConfidence: number,
  classes: Array<{ key: string; aliases: string[] }> = [],
  options: { inferTeams?: boolean } = {},
): ScoreboardExtraction {
  const inferTeams = options.inferTeams ?? true;
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
        ...leftColumn.slice(0, 48).map((entry) => ({ ...entry, team: entry._explicitTeam ? entry.team : inferTeams ? TeamColor.BLUE : null })),
        ...rightColumn.slice(0, 48).map((entry) => ({ ...entry, team: entry._explicitTeam ? entry.team : inferTeams ? TeamColor.RED : null })),
      ]
    : leftColumn.slice(0, 96).map((entry, index, rows) => ({
        ...entry,
        team: entry._explicitTeam
          ? entry.team
          : inferTeams
            ? (index < Math.ceil(rows.length / 2) ? TeamColor.BLUE : TeamColor.RED)
            : null,
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
    weaponEvidence: [],
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