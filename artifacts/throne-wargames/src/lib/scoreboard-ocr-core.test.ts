import assert from 'node:assert/strict';
import test from 'node:test';
import { TeamColor } from '@workspace/api-client-react';
import {
  classifyTeamPixels,
  cleanNumericCell,
  clusterRowAnchors,
  detectTeamFromText,
  scoreExtractionCandidate,
  type DetectedCell,
} from './scoreboard-ocr-core.ts';

test('repairs only known OCR character confusions in numeric cells', () => {
  assert.deepEqual(cleanNumericCell('3,2I1,932'), { value: 3_211_932, corrected: true });
  assert.deepEqual(cleanNumericCell('O'), { value: 0, corrected: true });
  assert.deepEqual(cleanNumericCell('27,402'), { value: 27_402, corrected: false });
  assert.deepEqual(cleanNumericCell('-12'), { value: null, corrected: false });
  assert.deepEqual(cleanNumericCell('12 HP'), { value: null, corrected: false });
});

test('clusters rows using evidence from multiple columns when a rank is missing', () => {
  const cells: DetectedCell[] = [
    { key: 'rank', text: '1', y: 20, confidence: 90 },
    { key: 'name', text: 'Milio', y: 21, confidence: 92 },
    { key: 'kills', text: '141', y: 19, confidence: 88 },
    { key: 'name', text: 'WolfFR', y: 60, confidence: 91 },
    { key: 'kills', text: '117', y: 61, confidence: 86 },
    { key: 'assists', text: '154', y: 59, confidence: 89 },
    { key: 'rank', text: '3', y: 100, confidence: 93 },
    { key: 'name', text: 'holydumpling', y: 101, confidence: 90 },
  ];

  const anchors = clusterRowAnchors(cells, 6);
  assert.equal(anchors.length, 3);
  assert.ok(anchors[1].keys.includes('name'));
  assert.ok(!anchors[1].keys.includes('rank'));
});

test('keeps a row anchored by rank even when its name cell is unreadable', () => {
  const cells: DetectedCell[] = [
    { key: 'rank', text: '1', y: 20, confidence: 90 },
    { key: 'kills', text: '143', y: 21, confidence: 88 },
    { key: 'assists', text: '223', y: 19, confidence: 89 },
  ];
  const anchors = clusterRowAnchors(cells, 6);
  assert.equal(anchors.length, 1);
  assert.ok(anchors[0].keys.includes('rank'));
});

test('recognizes supplied screenshot team labels and leaves unreadable labels unknown', () => {
  assert.equal(detectTeamFromText('Red').team, TeamColor.RED);
  assert.equal(detectTeamFromText('Yeilow').team, TeamColor.YELLOW);
  assert.equal(detectTeamFromText('Biue').team, TeamColor.BLUE);
  assert.equal(detectTeamFromText('—').team, null);
});

test('classifies strong team colors but rejects weak or mixed evidence', () => {
  assert.equal(
    classifyTeamPixels(Array.from({ length: 12 }, () => ({ r: 225, g: 48, b: 35 }))).team,
    TeamColor.RED,
  );
  assert.equal(
    classifyTeamPixels(Array.from({ length: 12 }, () => ({ r: 235, g: 205, b: 42 }))).team,
    TeamColor.YELLOW,
  );
  assert.equal(
    classifyTeamPixels(Array.from({ length: 12 }, () => ({ r: 42, g: 110, b: 235 }))).team,
    TeamColor.BLUE,
  );
  assert.equal(
    classifyTeamPixels(Array.from({ length: 12 }, () => ({ r: 130, g: 130, b: 130 }))).team,
    null,
  );
});

test('candidate scoring prefers complete supplied-scoreboard rows', () => {
  const complete = scoreExtractionCandidate(
    Array.from({ length: 19 }, (_, index) => ({
      characterName: `Visible player ${index + 1}`,
      populatedFields: 7,
      confidence: 88,
    })),
    86,
  );
  const incomplete = scoreExtractionCandidate(
    Array.from({ length: 17 }, (_, index) => ({
      characterName: `Visible player ${index + 1}`,
      populatedFields: 5,
      confidence: 78,
    })),
    82,
  );
  assert.ok(complete > incomplete);
});