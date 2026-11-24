import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { WEAPONS } from '../src/engine';

test.use({ viewport: { width: 390, height: 844 } });
test('all twenty weapons render different silhouettes, muzzle bursts, hits and ultimates within shared budgets', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [], silhouettes = new Set<string>(), colors = new Set<string>();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const snapshot = () => page.evaluate(() => (window as any).__weaponPreview.snapshot);
  for (const [tier, weapon] of WEAPONS.entries()) {
    await page.goto(`/tests/weapon-preview.html?weapon=${tier}`);
    await expect(page.getByRole('heading', { name: `Lv.${tier + 1} ${weapon.name}`, exact: true })).toBeVisible();
    const state = await snapshot();
    expect(state.shots).toBe(18); expect(state.vertices).toBeGreaterThan(20);
    silhouettes.add(createHash('sha256').update(JSON.stringify(state.geometry)).digest('hex'));
    colors.add(createHash('sha256').update(JSON.stringify(state.colors)).digest('hex'));
    await page.getByRole('button', { name: '开火', exact: true }).click();
    expect((await snapshot()).beams).toBeGreaterThan(0);
    await page.getByRole('button', { name: '命中', exact: true }).click();
    await page.screenshot({ path: `/tmp/topshooter-weapon-${tier + 1}.png` });
    await page.getByRole('button', { name: '大招', exact: true }).click();
    const ultimate = await snapshot();
    expect(ultimate.sigils).toBeGreaterThan(0);
    expect(ultimate.performance.playerEffects).toBeGreaterThan(0);
    expect(ultimate.calls).toBeLessThan(200);
    for (const kind of ['beams', 'sigils', 'columns', 'slashes']) expect(ultimate[kind]).toBeLessThanOrEqual(64);
    if ([0, 4, 9, 14, 19].includes(tier)) await page.screenshot({ path: `/tmp/topshooter-weapon-${tier + 1}-ultimate.png` });
    console.log(JSON.stringify({ tier: tier + 1, name: weapon.name, vertices: state.vertices, calls: ultimate.calls }));
  }
  expect(silhouettes.size).toBe(20); expect(colors.size).toBe(20); expect(errors).toEqual([]);
});
test('real Web Audio handles dense mixed attacks without clipping and releases every synth voice', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/tests/weapon-preview.html?weapon=19');
  await page.getByRole('button', { name: '音效压力', exact: true }).click();
  await expect(page.getByRole('button', { name: '音效完成', exact: true })).toBeVisible({ timeout: 15000 });
  const result = await page.evaluate(() => (window as any).__weaponPreview.snapshot.audioResult);
  expect(result.context).toBe('running');
  expect(result.peak).toBeGreaterThan(.005); expect(result.peak).toBeLessThan(.8);
  expect(result.rms).toBeGreaterThan(.001);
  expect(result.peakVoices).toBeLessThanOrEqual(32); expect(result.dropped).toBeGreaterThan(4000);
  expect(result.voices).toEqual({ music: 0, shot: 0, cue: 0 });
  console.log(JSON.stringify({ audio: result })); expect(errors).toEqual([]);
});
