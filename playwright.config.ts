import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['browser.spec.ts', 'boss.spec.ts', 'weapon.spec.ts'],
  timeout: 45000,
  outputDir: '/tmp/topshooter-browser-results',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
  },
});
