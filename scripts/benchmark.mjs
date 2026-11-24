import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const url = process.argv[2] || 'http://localhost:5173';
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, offline: url.startsWith('file:') });
  const errors = [], network = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.goto(url);
  await page.getByRole('button', { name: '开始挑战' }).click();
  await page.keyboard.press('ArrowLeft');
  const result = await page.evaluate(() => new Promise(resolve => {
    const samples = [];
    const start = performance.now();
    let last = start;
    function frame(now) {
      if (now - start > 1500) samples.push(now - last);
      last = now;
      if (now - start < 8000) requestAnimationFrame(frame);
      else {
        samples.sort((a, b) => a - b);
        resolve({
          frames: samples.length,
          meanMs: samples.reduce((a, b) => a + b, 0) / samples.length,
          p95Ms: samples[Math.floor(samples.length * .95)],
          slowFrames: samples.filter(ms => ms > 33.4).length,
          renderer: window.__topShooter.renderer,
          performance: window.__topShooter.performance,
          status: window.__topShooter.status,
        });
      }
    }
    requestAnimationFrame(frame);
  }));
  console.log(JSON.stringify({ ...result, errors, networkRequests: network.length }, null, 2));
} finally {
  await browser.close();
}
