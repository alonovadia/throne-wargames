import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TeamColor } from '@workspace/api-client-react';
import { mergeExternalOcr, mergeOcrParticipants, parseScoreboardText } from './scoreboard-ocr.ts';

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

test('parses five stats and explicit YELLOW team color from raw text lines', () => {
  const rawText = 'YELLOWPlayer Yellow 1 2 3,000 4,000 5,000\nBLUEPlayer Blue 5 4 3,000 2,000 1,000';
  const extraction = parseScoreboardText(rawText, 90);

  assert.equal(extraction.participants.length, 2);
  const p1 = extraction.participants[0];
  assert.equal(p1.characterName, 'YELLOWPlayer');
  assert.equal(p1.team, TeamColor.YELLOW);
  assert.equal(p1.kills, 1);
  assert.equal(p1.assists, 2);
  assert.equal(p1.damageDealt, 3000);
  assert.equal(p1.damageTaken, 4000);
  assert.equal(p1.healingDone, 5000);

  const p2 = extraction.participants[1];
  assert.equal(p2.characterName, 'BLUEPlayer');
  assert.equal(p2.team, TeamColor.BLUE);
  assert.equal(p2.kills, 5);
  assert.equal(p2.assists, 4);
  assert.equal(p2.damageDealt, 3000);
  assert.equal(p2.damageTaken, 2000);
  assert.equal(p2.healingDone, 1000);
});

test('does not infer positional teams for external OCR text', () => {
  const extraction = parseScoreboardText(
    'Milio 1 2 3,000 4,000 5,000',
    90,
    [],
    { inferTeams: false },
  );

  assert.equal(extraction.participants.length, 1);
  assert.equal(extraction.participants[0].team, null);
});

test('merges external suggestions without overwriting local values', () => {
  const local = parseScoreboardText(
    'Milio 141 140 9,945,289 2,798,420 90,970',
    90,
    [],
    { inferTeams: false },
  );
  const external = parseScoreboardText(
    'Milio Yellow 141 999 9,945,289 2,798,420 90,970',
    90,
    [],
    { inferTeams: false },
  );

  const merged = mergeExternalOcr(local, external);
  assert.equal(merged.participants[0].assists, 140);
  assert.equal(merged.participants[0].team, TeamColor.YELLOW);
  assert.ok(merged.participants[0].warnings.some((warning) => warning.includes('assists disagrees')));
});

test('merges overlapping screenshots by rank without duplicating players', () => {
  const first = parseScoreboardText(
    '11 LandaHans Red 63 123 4,187,002 1,717,347 0\n12 Clown31 Red 62 103 3,779,834 2,946,397 67,155',
    90,
    [],
    { inferTeams: false },
  );
  const second = parseScoreboardText(
    '11 LandaHans Red 63 123 4,187,002 1,717,347 0\n13 Bojii Red 60 60 3,522,964 1,351,074 0',
    90,
    [],
    { inferTeams: false },
  );

  const merged = mergeOcrParticipants([first, second]);

  assert.equal(merged.participants.length, 3);
  assert.equal(merged.duplicateCount, 1);
  assert.deepEqual(merged.participants.map((participant) => participant.rank), [11, 12, 13]);
});