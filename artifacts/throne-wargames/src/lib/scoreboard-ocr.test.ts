import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TeamColor } from '@workspace/api-client-react';
import { parseScoreboardText } from './scoreboard-ocr.ts';

type Fixture = {
  sourceResolution: '1920x1080' | '2560x1440';
  layout: 'single-column' | 'two-column';
  ocrConfidence: number;
  expectedRows: number;
  rawText: string;
};

async function loadFixture(name: string): Promise<Fixture> {
  return JSON.parse(
    await readFile(new URL(`./__fixtures__/${name}.json`, import.meta.url), 'utf8'),
  ) as Fixture;
}

test('parses a captured 1080p single-column extraction into two complete teams', async () => {
  const fixture = await loadFixture('scoreboard-1080p-single-column');
  const extraction = parseScoreboardText(fixture.rawText, fixture.ocrConfidence);

  assert.equal(fixture.sourceResolution, '1920x1080');
  assert.equal(fixture.layout, 'single-column');
  assert.equal(extraction.participants.length, fixture.expectedRows);
  assert.equal(extraction.participants.filter((row) => row.team === TeamColor.BLUE).length, 6);
  assert.equal(extraction.participants.filter((row) => row.team === TeamColor.RED).length, 6);
  assert.ok(extraction.participants.every((row) => row.confirmed === false));
});

test('parses a captured 1440p two-column extraction in visual team order', async () => {
  const fixture = await loadFixture('scoreboard-1440p-two-column');
  const extraction = parseScoreboardText(fixture.rawText, fixture.ocrConfidence);

  assert.equal(fixture.sourceResolution, '2560x1440');
  assert.equal(fixture.layout, 'two-column');
  assert.equal(extraction.participants.length, fixture.expectedRows);
  assert.deepEqual(
    extraction.participants.slice(0, 2).map((row) => row.characterName),
    ['Aegis', 'Briar'],
  );
  assert.deepEqual(
    extraction.participants.slice(6, 8).map((row) => row.characterName),
    ['Gale', 'Harrow'],
  );
});

test('preserves low confidence and missing icon-only weapon fields for operator review', async () => {
  const fixture = await loadFixture('scoreboard-1080p-low-confidence');
  const extraction = parseScoreboardText(fixture.rawText, fixture.ocrConfidence);

  assert.equal(extraction.participants.length, fixture.expectedRows);
  assert.ok(extraction.confidence < 80);
  assert.ok(extraction.participants.some((row) => row.mainWeapon === null || row.offWeapon === null));
});

test('returns no rows when captured OCR extraction fails', async () => {
  const fixture = await loadFixture('scoreboard-1440p-failed');
  const extraction = parseScoreboardText(fixture.rawText, fixture.ocrConfidence);

  assert.equal(extraction.participants.length, fixture.expectedRows);
  assert.equal(extraction.confidence, 0);
});

test('parses two scoreboard columns with more than six players per team', () => {
  const rawText = Array.from({ length: 20 }, (_, index) =>
    `Blue${index + 1} Staff Wand ${index} ${index + 1} ${index + 2} ${index + 3} Red${index + 1} Longbow Dagger ${index + 4} ${index + 5} ${index + 6} ${index + 7}`,
  ).join('\n');
  const extraction = parseScoreboardText(rawText, 90);

  assert.equal(extraction.participants.length, 40);
  assert.equal(extraction.participants.filter((row) => row.team === TeamColor.BLUE).length, 20);
  assert.equal(extraction.participants.filter((row) => row.team === TeamColor.RED).length, 20);
});