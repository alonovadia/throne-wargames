import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const systemChromium = '/repl/tools/bin/chromium';
const browserExecutable = process.env.OCR_TEST_BROWSER ??
  (existsSync(systemChromium) ? systemChromium : undefined);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: process.env.OCR_TEST_BASE_URL ?? 'http://127.0.0.1:20047',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(browserExecutable ? { launchOptions: { executablePath: browserExecutable } } : {}),
      },
    },
  ],
  webServer: {
    command: 'PORT=20047 BASE_PATH=/ pnpm run dev',
    url: 'http://127.0.0.1:20047/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});