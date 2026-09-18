import { TeamColor } from '@workspace/api-client-react';

export type OcrFieldKey =
  | 'rank'
  | 'name'
  | 'team'
  | 'kills'
  | 'assists'
  | 'damageDealt'
  | 'damageTaken'
  | 'healingDone';

export type DetectedCell = {
  key: OcrFieldKey;
  text: string;
  y: number;
  confidence: number;
};

export type RowAnchor = {
  y: number;
  support: number;
  keys: OcrFieldKey[];
};

export type NumericCellResult = {
  value: number | null;
  corrected: boolean;
};

export type TeamDetection = {
  team: TeamColor | null;
  confidence: number;
  source: 'text' | 'color' | 'unknown';
};

const numericConfusions: Record<string, string> = {
  O: '0',
  o: '0',
  Q: '0',
  I: '1',
  l: '1',
  '|': '1',
  S: '5',
  s: '5',
  B: '8',
  Z: '2',
  z: '2',
  G: '6',
  T: '7',
};

export function cleanNumericCell(text: string): NumericCellResult {
  const compact = text.replace(/[\s,.'’`]/g, '');
  if (!compact) return { value: null, corrected: false };

  let corrected = false;
  let normalized = '';
  for (const character of compact) {
    if (/\d/.test(character)) {
      normalized += character;
    } else if (numericConfusions[character]) {
      normalized += numericConfusions[character];
      corrected = true;
    } else if (/[-–—]/.test(character)) {
      return { value: null, corrected: false };
    } else {
      return { value: null, corrected: false };
    }
  }

  const value = Number(normalized);
  return Number.isSafeInteger(value) && value >= 0
    ? { value, corrected }
    : { value: null, corrected: false };
}

export function clusterRowAnchors(cells: DetectedCell[], tolerance: number): RowAnchor[] {
  const relevant = cells
    .filter((cell) => cell.text.trim())
    .sort((left, right) => left.y - right.y);
  const clusters: DetectedCell[][] = [];

  for (const cell of relevant) {
    const previous = clusters.at(-1);
    const previousCenter = previous
      ? previous.reduce((sum, entry) => sum + entry.y, 0) / previous.length
      : Number.NEGATIVE_INFINITY;
    if (previous && Math.abs(cell.y - previousCenter) <= tolerance) {
      previous.push(cell);
    } else {
      clusters.push([cell]);
    }
  }

  return clusters
    .map((cluster) => {
      const keys = [...new Set(cluster.map((cell) => cell.key))];
      const confidenceWeight = cluster.reduce((sum, cell) => sum + Math.max(1, cell.confidence), 0);
      return {
        y: cluster.reduce((sum, cell) => sum + cell.y * Math.max(1, cell.confidence), 0) / confidenceWeight,
        support: keys.length,
        keys,
      };
    })
    .filter((anchor) =>
      anchor.keys.includes('name') ||
      anchor.keys.includes('rank') ||
      anchor.support >= 2,
    );
}

export function detectTeamFromText(text: string): TeamDetection {
  const normalized = text.toLowerCase().replace(/[^a-z]/g, '');
  if (normalized.includes('blue') || normalized === 'biue') {
    return { team: TeamColor.BLUE, confidence: 90, source: 'text' };
  }
  if (normalized.includes('red') || normalized === 'reo') {
    return { team: TeamColor.RED, confidence: 90, source: 'text' };
  }
  if (normalized.includes('yellow') || normalized.includes('yel') || normalized === 'yeilow') {
    return { team: TeamColor.YELLOW, confidence: 90, source: 'text' };
  }
  return { team: null, confidence: 0, source: 'unknown' };
}

function rgbToHueAndSaturation(red: number, green: number, blue: number) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  if (delta === 0) return { hue: 0, saturation: 0, lightness: maximum };

  let hue = 0;
  if (maximum === r) hue = 60 * (((g - b) / delta) % 6);
  else if (maximum === g) hue = 60 * ((b - r) / delta + 2);
  else hue = 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  return {
    hue,
    saturation: maximum === 0 ? 0 : delta / maximum,
    lightness: maximum,
  };
}

export function classifyTeamPixels(pixels: Array<{ r: number; g: number; b: number }>): TeamDetection {
  const votes = new Map<TeamColor, number>([
    [TeamColor.BLUE, 0],
    [TeamColor.RED, 0],
    [TeamColor.YELLOW, 0],
  ]);

  for (const pixel of pixels) {
    const { hue, saturation, lightness } = rgbToHueAndSaturation(pixel.r, pixel.g, pixel.b);
    if (saturation < 0.28 || lightness < 0.22) continue;
    if (hue <= 18 || hue >= 342) votes.set(TeamColor.RED, (votes.get(TeamColor.RED) ?? 0) + saturation);
    else if (hue >= 35 && hue <= 72) votes.set(TeamColor.YELLOW, (votes.get(TeamColor.YELLOW) ?? 0) + saturation);
    else if (hue >= 185 && hue <= 245) votes.set(TeamColor.BLUE, (votes.get(TeamColor.BLUE) ?? 0) + saturation);
  }

  const ranked = [...votes.entries()].sort((left, right) => right[1] - left[1]);
  const [winner, runnerUp] = ranked;
  if (!winner || winner[1] < 3 || winner[1] < (runnerUp?.[1] ?? 0) * 1.35) {
    return { team: null, confidence: 0, source: 'unknown' };
  }
  return {
    team: winner[0],
    confidence: Math.min(88, Math.round(55 + winner[1])),
    source: 'color',
  };
}

export function scoreExtractionCandidate(
  rows: Array<{ characterName: string; populatedFields: number; confidence: number }>,
  ocrConfidence: number,
) {
  if (!rows.length) return 0;
  const coverage = rows.reduce((sum, row) => sum + row.populatedFields, 0) / (rows.length * 7);
  const rowConfidence = rows.reduce((sum, row) => sum + row.confidence, 0) / rows.length;
  return rows.length * 100 + coverage * 70 + rowConfidence * 0.2 + ocrConfidence * 0.1;
}