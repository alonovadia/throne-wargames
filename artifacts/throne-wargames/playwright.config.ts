import { existsSync, readdirSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const browserLibraries = [
  'libglib-2.0.so.0',
  'libgbm.so.1',
  'libnss3.so',
  'libnspr4.so',
  'libatk-1.0.so.0',
  'libcups.so.2',
  'libdbus-1.so.3',
  'libexpat.so.1',
  'libfontconfig.so.1',
  'libfreetype.so.6',
  'libgdk_pixbuf-2.0.so.0',
  'libgtk-3.so.0',
  'libpango-1.0.so.0',
  'libX11.so.6',
  'libXcomposite.so.1',
  'libXdamage.so.1',
  'libXext.so.6',
  'libXfixes.so.3',
  'libXrandr.so.2',
  'libxcb.so.1',
];

function exposeNixBrowserLibraries() {
  const nixStore = '/nix/store';
  if (!existsSync(nixStore)) return;
  const libraryDirectories = new Set<string>();
  for (const entry of readdirSync(nixStore)) {
    const libraryDirectory = `${nixStore}/${entry}/lib`;
    if (browserLibraries.some((library) => existsSync(`${libraryDirectory}/${library}`))) {
      libraryDirectories.add(libraryDirectory);
    }
  }
  if (libraryDirectories.size > 0) {
    process.env.LD_LIBRARY_PATH = [
      ...libraryDirectories,
      process.env.LD_LIBRARY_PATH,
    ].filter(Boolean).join(':');
  }
}

exposeNixBrowserLibraries();

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
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'PORT=20047 BASE_PATH=/ pnpm run dev',
    url: 'http://127.0.0.1:20047/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});