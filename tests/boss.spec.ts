import { expect, test } from '@playwright/test';
import { BOSS_TYPES, bossInfo } from '../src/engine';

test.use({ viewport: { width: 390, height: 844 } });
for (const [index, type] of BOSS_TYPES.entries()) {
  test(`Top Shooter ${index + 1}/50 ${type}: model, both skills, texture reuse and disposal`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`/tests/boss-preview.html?boss=${type}`);
    await expect(page.getByRole('heading', { name: bossInfo(type).name })).toBeVisible();
    const snapshot = () => page.evaluate(() => (window as any).__bossPreview.snapshot);
    await expect.poll(async () => (await snapshot()).joints).toBeGreaterThan(0);
    const before = await snapshot();
    await page.evaluate(() => (window as any).__bossPreview.setGate(20));
    await expect.poll(async () => (await snapshot()).label).toBe('+20');
    const after = await snapshot();
    expect(after.textureId).toBe(before.textureId);
    expect(after.textures).toBe(before.textures);
    expect(after.calls).toBeLessThan(210);
    expect(after.signature.vertices).toBeGreaterThan(100);
    for (const [slot, skill] of bossInfo(type).skills.entries()) {
      await page.getByRole('button', { name: '预警', exact: true }).click();
      await expect.poll(async () => (await snapshot()).castIds).toContain(skill.effect.id);
      expect((await snapshot()).sigils).toBeGreaterThan(0);
      await page.screenshot({ path: `/tmp/topshooter-${type}-${slot}-cast.png` });
      await page.getByRole('button', { name: '攻击', exact: true }).click();
      await expect.poll(async () => (await snapshot()).effectIds).toContain(skill.effect.id);
      const impact = await snapshot();
      expect(impact.beams + impact.columns + impact.slashes).toBeGreaterThan(0);
      expect(impact.sigils).toBeGreaterThan(0);
      expect(impact.calls).toBeLessThan(230);
      await page.screenshot({ path: `/tmp/topshooter-${type}-${slot}-impact.png` });
    }
    await page.evaluate(() => (window as any).__bossPreview.clear());
    await expect.poll(async () => (await snapshot()).textureId).toBeUndefined();
    expect((await snapshot()).textures).toBeLessThan(after.textures);
    expect((await snapshot()).geometries).toBeLessThan(after.geometries);
    console.log(JSON.stringify({ type, joints: after.joints, calls: after.calls, model: after.signature,
      skills: bossInfo(type).skills.map(skill => skill.effect.id) }));
    expect(errors).toEqual([]);
  });
}
test('Top Shooter ultimate renders colored energy rings and blades within the effect budget', async ({ page }) => {
  await page.goto('/tests/boss-preview.html?boss=seraph');
  await page.getByRole('button', { name: '爆发' }).click();
  const snapshot = await page.evaluate(() => (window as any).__bossPreview.snapshot);
  expect(snapshot.performance.playerEffects).toBeGreaterThan(0);
  expect(snapshot.sigils).toBeGreaterThan(0); expect(snapshot.beams).toBeGreaterThan(0);
  expect(snapshot.calls).toBeLessThan(230);
  await page.screenshot({ path: '/tmp/topshooter-ultimate.png' });
});
