import type { ScoreboardExtraction, VerifiedParticipant } from './scoreboard-ocr';

export type CorpusRow = {
  rank: number;
  characterName: string;
  team: 'BLUE' | 'RED' | 'YELLOW';
  kills: number;
  assists: number;
  damageDealt: number;
  damageTaken: number;
  healingDone: number;
};

export type CorpusCapture = {
  id: string;
  sourcePath: string;
  description: string;
  expectedRows: CorpusRow[];
  minRowRecall: number;
  maxTeamMismatches: number;
  maxNumericMismatches: number;
  maxUncertainRows: number;
};

export type CorpusEvaluation = {
  captureId: string;
  expectedRows: number;
  actualRows: number;
  matchedRows: number;
  missingRows: number[];
  extraRows: number;
  shiftedRows: number[];
  nameMismatches: Array<{ rank: number; expected: string; actual: string }>;
  teamMismatches: Array<{ rank: number; expected: string; actual: string | null }>;
  numericMismatches: Array<{
    rank: number;
    field: keyof Pick<CorpusRow, 'kills' | 'assists' | 'damageDealt' | 'damageTaken' | 'healingDone'>;
    expected: number;
    actual: number | null;
  }>;
  uncertainRows: number[];
  rowRecall: number;
  passed: boolean;
};

const numericFields = ['kills', 'assists', 'damageDealt', 'damageTaken', 'healingDone'] as const;

function normalizeName(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, '');
}

export function evaluateCorpusCapture(
  capture: CorpusCapture,
  extraction: Pick<ScoreboardExtraction, 'participants'>,
): CorpusEvaluation {
  const actualByRank = new Map<number, VerifiedParticipant>();
  for (const participant of extraction.participants) {
    if (participant.rank !== null && !actualByRank.has(participant.rank)) actualByRank.set(participant.rank, participant);
  }

  const missingRows: number[] = [];
  const shiftedRows: number[] = [];
  const nameMismatches: CorpusEvaluation['nameMismatches'] = [];
  const teamMismatches: CorpusEvaluation['teamMismatches'] = [];
  const numericMismatches: CorpusEvaluation['numericMismatches'] = [];
  const uncertainRows: number[] = [];
  let matchedRows = 0;

  for (const expected of capture.expectedRows) {
    const actual = actualByRank.get(expected.rank);
    if (!actual) {
      missingRows.push(expected.rank);
      continue;
    }
    matchedRows += 1;
    const expectedIndex = capture.expectedRows.findIndex((row) => row.rank === expected.rank);
    const actualIndex = extraction.participants.indexOf(actual);
    if (actualIndex !== expectedIndex) shiftedRows.push(expected.rank);
    if (normalizeName(actual.characterName) !== normalizeName(expected.characterName)) {
      nameMismatches.push({ rank: expected.rank, expected: expected.characterName, actual: actual.characterName });
    }
    if (actual.team !== expected.team) {
      teamMismatches.push({ rank: expected.rank, expected: expected.team, actual: actual.team });
    }
    if (actual.warnings.length > 0 || actual.team === null) uncertainRows.push(expected.rank);
    for (const field of numericFields) {
      if (actual[field] !== expected[field]) {
        numericMismatches.push({
          rank: expected.rank,
          field,
          expected: expected[field],
          actual: actual[field],
        });
      }
    }
  }

  const extraRows = Math.max(0, extraction.participants.length - matchedRows);
  const rowRecall = capture.expectedRows.length
    ? matchedRows / capture.expectedRows.length
    : 1;
  const passed =
    rowRecall >= capture.minRowRecall &&
    extraRows === 0 &&
    shiftedRows.length === 0 &&
    nameMismatches.length === 0 &&
    teamMismatches.length <= capture.maxTeamMismatches &&
    numericMismatches.length <= capture.maxNumericMismatches &&
    uncertainRows.length <= capture.maxUncertainRows;

  return {
    captureId: capture.id,
    expectedRows: capture.expectedRows.length,
    actualRows: extraction.participants.length,
    matchedRows,
    missingRows,
    extraRows,
    shiftedRows,
    nameMismatches,
    teamMismatches,
    numericMismatches,
    uncertainRows,
    rowRecall,
    passed,
  };
}

export async function evaluateOcrCorpus(
  corpus: CorpusCapture[],
  extract: (capture: CorpusCapture) => Promise<Pick<ScoreboardExtraction, 'participants'>>,
) {
  const reports: CorpusEvaluation[] = [];
  for (const capture of corpus) {
    reports.push(await evaluateCorpusCapture(capture, await extract(capture)));
  }
  return reports;
}

export function formatCorpusEvaluation(report: CorpusEvaluation) {
  const status = report.passed ? 'PASS' : 'FAIL';
  return [
    `${status} ${report.captureId}: ${report.matchedRows}/${report.expectedRows} rows (${Math.round(report.rowRecall * 100)}% recall)`,
    report.missingRows.length ? `  missing rows: ${report.missingRows.join(', ')}` : '',
    report.extraRows ? `  extra rows: ${report.extraRows}` : '',
    report.shiftedRows.length ? `  shifted rows: ${report.shiftedRows.join(', ')}` : '',
    report.nameMismatches.length ? `  name mismatches: ${report.nameMismatches.length}` : '',
    report.teamMismatches.length ? `  team mismatches: ${report.teamMismatches.length}` : '',
    report.numericMismatches.length ? `  numeric mismatches: ${report.numericMismatches.length}` : '',
    report.uncertainRows.length ? `  uncertain rows: ${report.uncertainRows.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}