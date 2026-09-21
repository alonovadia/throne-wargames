import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { TeamColor } from '@workspace/api-client-react';
import type { VerifiedParticipant } from './scoreboard-ocr.ts';
import {
  evaluateCorpusCapture,
  evaluateOcrCorpus,
  formatCorpusEvaluation,
  type CorpusCapture,
} from './scoreboard-ocr-corpus.ts';

async function loadCorpus() {
  return JSON.parse(
    await readFile(new URL('./__fixtures__/scoreboard-ocr-corpus.json', import.meta.url), 'utf8'),
  ) as CorpusCapture[];
}

function referenceParticipants(capture: CorpusCapture): VerifiedParticipant[] {
  return capture.expectedRows.map((row) => ({
    rank: row.rank,
    characterName: row.characterName,
    team: row.team as TeamColor,
    mainWeapon: null,
    offWeapon: null,
    kills: row.kills,
    assists: row.assists,
    damageDealt: row.damageDealt,
    damageTaken: row.damageTaken,
    healingDone: row.healingDone,
    confidence: 100,
    fieldConfidence: {},
    warnings: [],
    confirmed: false,
  }));
}

test('the supplied screenshot corpus contains complete labeled row and stat baselines', async () => {
  const corpus = await loadCorpus();
  assert.equal(corpus.length, 3);
  assert.deepEqual(corpus.map((capture) => capture.expectedRows.length), [10, 9, 10]);
  for (const capture of corpus) {
    assert.ok(capture.sourcePath.startsWith('attached_assets/'));
    await access(new URL(`../../../../${capture.sourcePath}`, import.meta.url));
    assert.ok(capture.expectedRows.every((row) =>
      row.rank > 0 &&
      row.characterName.length > 0 &&
      ['BLUE', 'RED', 'YELLOW'].includes(row.team) &&
      [row.kills, row.assists, row.damageDealt, row.damageTaken, row.healingDone]
        .every((value) => Number.isSafeInteger(value) && value >= 0),
    ));
    assert.equal(capture.maxTeamMismatches, 0);
    assert.equal(capture.maxNumericMismatches, 0);
  }
});

test('reference extractions pass every supplied screenshot baseline', async () => {
  const corpus = await loadCorpus();
  const reports = await evaluateOcrCorpus(corpus, async (capture) => ({
    participants: referenceParticipants(capture),
  }));

  assert.ok(reports.every((report) => report.passed));
  assert.ok(reports.every((report) => report.rowRecall === 1));
  assert.ok(reports.every((report) => formatCorpusEvaluation(report).startsWith('PASS')));
});

test('benchmark report separates missing, shifted, uncertain, team, and numeric errors', async () => {
  const [capture] = await loadCorpus();
  const actual = referenceParticipants(capture);
  actual.splice(2, 1);
  actual[1] = {
    ...actual[1],
    rank: 2,
    team: null,
    warnings: ['Team could not be recognized'],
    damageTaken: 999,
  };

  const report = evaluateCorpusCapture(capture, { participants: actual });
  assert.deepEqual(report.missingRows, [3]);
  assert.equal(report.extraRows, 0);
  assert.deepEqual(report.shiftedRows, [4, 5, 6, 7, 8, 9, 10]);
  assert.equal(report.teamMismatches.length, 1);
  assert.equal(report.numericMismatches.length, 1);
  assert.deepEqual(report.uncertainRows, [2]);
  assert.equal(report.passed, false);
  assert.match(formatCorpusEvaluation(report), /missing rows: 3/);
  assert.match(formatCorpusEvaluation(report), /team mismatches: 1/);
  assert.match(formatCorpusEvaluation(report), /numeric mismatches: 1/);
});

test('benchmark thresholds allow recall gaps only when the corpus explicitly permits them', async () => {
  const [capture] = await loadCorpus();
  const relaxedCapture = { ...capture, minRowRecall: 0.9, maxUncertainRows: 1 };
  const actual = referenceParticipants(capture);
  actual.pop();
  actual[0] = { ...actual[0], warnings: ['Damage Taken has low OCR confidence'] };

  const report = evaluateCorpusCapture(relaxedCapture, { participants: actual });
  assert.equal(report.rowRecall, 0.9);
  assert.equal(report.passed, true);
});