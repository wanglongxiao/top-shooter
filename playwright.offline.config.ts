import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'offline.spec.ts',
  timeout: 45000,
  outputDir: '/tmp/topshooter-offline-results',
  reporter: 'list',
  workers: 1,
  use: { channel: 'chrome', headless: true, offline: true },
});
