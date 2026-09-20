import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { TeamColor } from '@workspace/api-client-react';
import {
  evaluateCorpusCapture,
  type CorpusCapture,
} from '../src/lib/scoreboard-ocr-corpus';

const artifactRoot = path.resolve(import.meta.dirname, '..');
const corpusPath = path.resolve(artifactRoot, 'src/lib/__fixtures__/scoreboard-ocr-corpus.json');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as CorpusCapture[];

const adminSummary = {
  visitorsToday: 0,
  visitorsThisWeek: 0,
  applicationQueue: 0,
  ocrConfidence: null,
  activity: [],
};

async function openScoreboardVerifier(page: Page) {
  await page.route('**/api/admin/summary', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(adminSummary) }),
  );
  await page.route('**/api/classes', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );
  await page.goto('/admin');
  await expect(page.getByTestId('button-open-commit')).toBeVisible();
  await page.getByTestId('button-open-commit').click();
  await expect(page.getByTestId('panel-commit-match')).toBeVisible();
}

async function runBrowserOcr(page: Page, sourcePath: string) {
  const panel = page.getByTestId('panel-commit-match');
  await panel.getByTestId('input-scoreboard-file').setInputFiles(path.resolve(artifactRoot, '..', '..', sourcePath));
  await expect(panel.getByTestId('button-run-ocr')).toBeEnabled();
  const runButton = panel.getByTestId('button-run-ocr');
  let lastProgress = '';
  const progressTimer = setInterval(() => {
    void runButton.textContent().then((text) => {
      const normalized = text?.trim() ?? '';
      if (normalized && normalized !== lastProgress) {
        lastProgress = normalized;
        process.stdout.write(`[browser-ocr] ${normalized}\n`);
      }
    }).catch(() => undefined);
  }, 5_000);
  try {
    await runButton.click();
    await expect(runButton).toHaveText('Extract scoreboard', { timeout: 180_000 });
    await expect(panel.getByText(/rows extracted for operator review/)).toBeVisible();
  } finally {
    clearInterval(progressTimer);
  }

  return panel.locator('tbody tr').evaluateAll((rows) =>
    rows.map((row) => {
      const inputValue = (selector: string) =>
        (row.querySelector(selector) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';
      const firstCell = row.querySelector('td')?.textContent?.trim() ?? '';
      const title = row.getAttribute('title') ?? '';
      return {
        rank: Number.parseInt(firstCell, 10) || null,
        characterName: inputValue('input[aria-label^="Character "]'),
        team: inputValue('select[aria-label^="Team "]') || null,
        kills: inputValue('input[aria-label^="kills "]'),
        assists: inputValue('input[aria-label^="assists "]'),
        damageDealt: inputValue('input[aria-label^="damageDealt "]'),
        damageTaken: inputValue('input[aria-label^="damageTaken "]'),
        healingDone: inputValue('input[aria-label^="healingDone "]'),
        warnings: title ? title.split(' · ') : [],
      };
    }),
  );
}

function numericValue(value: string) {
  return value === '' ? null : Number(value);
}

function toCorpusExtraction(rows: Awaited<ReturnType<typeof runBrowserOcr>>) {
  return {
    participants: rows.map((row) => ({
      rank: row.rank,
      characterName: row.characterName,
      team: row.team as TeamColor | null,
      mainWeapon: null,
      offWeapon: null,
      kills: numericValue(row.kills),
      assists: numericValue(row.assists),
      damageDealt: numericValue(row.damageDealt),
      damageTaken: numericValue(row.damageTaken),
      healingDone: numericValue(row.healingDone),
      confidence: 100,
      fieldConfidence: {},
      warnings: row.warnings,
      confirmed: false,
    })),
  };
}

test('runs real browser OCR on a supplied scoreboard image', async ({ page }) => {
  test.setTimeout(240_000);
  await openScoreboardVerifier(page);
  const rows = await runBrowserOcr(page, 'attached_assets/1_1789717015998.png');

  expect(rows.length).toBeGreaterThan(0);
  expect(rows.some((row) => row.kills !== '' && row.damageDealt !== '')).toBe(true);
});

for (const capture of corpus) {
  test(`benchmarks browser OCR: ${capture.id}`, async ({ page }) => {
    test.setTimeout(240_000);
    process.stdout.write(`[browser-ocr] ${capture.id}: starting\n`);
    await openScoreboardVerifier(page);
    const rows = await runBrowserOcr(page, capture.sourcePath);
    const report = evaluateCorpusCapture(capture, toCorpusExtraction(rows));
    process.stdout.write(`[browser-ocr] ${capture.id}: ${report.matchedRows}/${report.expectedRows} rows, ${report.numericMismatches.length} numeric mismatches\n`);
    assert.ok(report.passed, JSON.stringify({
      captureId: report.captureId,
      matchedRows: report.matchedRows,
      expectedRows: report.expectedRows,
      missingRows: report.missingRows,
      extraRows: report.extraRows,
      nameMismatches: report.nameMismatches.length,
      teamMismatches: report.teamMismatches.length,
      numericMismatches: report.numericMismatches.length,
      uncertainRows: report.uncertainRows,
    }, null, 2));
  });
}