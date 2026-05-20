import { defineConfig } from '@playwright/test';
import { env } from './config/env.js';

export default defineConfig({
  testDir: './tests',
  testIgnore: ['**/*.setup.js'],
  timeout: env.runtime.timeout,
  expect: { timeout: 5_000 },

  // Single session — one browser, one worker. No parallel tabs.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['./reporters/dashboard-reporter.js'],
  ],
  outputDir: 'test-results',

  use: {
    baseURL: env.baseURL || env.dashboard.url,
    headless: env.runtime.headless,
    screenshot: env.runtime.screenshot,
    video: env.runtime.video,
    trace: env.runtime.trace,
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  },

  projects: [
    // Single chromium project. Each module spec uses test.beforeAll() to log
    // in once and share a BrowserContext across all its tests (see
    // tests/authentication.spec.js for the pattern).
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
