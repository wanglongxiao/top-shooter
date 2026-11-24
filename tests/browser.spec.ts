import { expect, test, type Page } from '@playwright/test';

async function state(page: Page) {
  return page.evaluate(() => (window as unknown as {
    __topShooter: { status: string; x: number; troops: number; distance: number; score: number; elapsed: number;
      difficulty: number; weapon: number; kills: number; gear: number; mastery: number; bossesKilled: number;
      defeatReason: string; boss: { hp: number; maxHp: number; seconds: number; focus: number; z: number } | null;
      formation: { roadZ: number; heroZ: number; baseline: number; left: number; right: number }; records: { name: string; score: number }[] };
  }).__topShooter);
}
test.describe('phone portrait and touch controls', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('touch controls, pause, resume and completed score persistence', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');
    await expect(page.getByRole('button', { name: '开始挑战' })).toBeVisible();
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      frame: { top: document.querySelector('#game-frame')!.getBoundingClientRect().top,
        height: document.querySelector('#game-frame')!.getBoundingClientRect().height },
      canvasHeight: document.querySelector('canvas')!.getBoundingClientRect().height, height: innerHeight,
    }));
    expect(layout.overflow).toBe(false); expect(layout.frame.top).toBe(0);
    expect(layout.frame.height).toBe(layout.height); expect(layout.canvasHeight).toBe(layout.height);
    await page.screenshot({ path: '/tmp/topshooter-phone.png' });
    await page.getByRole('textbox', { name: '射手代号' }).fill('触控射手');
    await page.getByRole('button', { name: '开始挑战' }).tap();
    await expect.poll(async () => (await state(page)).status).toBe('playing');
    const stationary = (await state(page)).formation;
    expect(stationary.baseline).toBeGreaterThan(.72); expect(stationary.baseline).toBeLessThan(.85);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 590 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 590 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (await state(page)).x).toBeLessThan(-2);
    expect((await state(page)).formation.heroZ).toBe(stationary.heroZ);
    expect((await state(page)).formation.roadZ).toBe(0);
    expect((await state(page)).formation.left).toBeGreaterThanOrEqual(0);
    expect((await state(page)).formation.right).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: '暂停游戏' }).tap();
    await expect.poll(async () => (await state(page)).status).toBe('paused');
    const paused = await state(page);
    await expect(page.getByRole('heading', { name: '火力，稍作停留' })).toBeVisible();
    expect((await state(page)).distance).toBe(paused.distance);
    await page.getByRole('button', { name: '继续挑战' }).tap();
    await expect.poll(async () => (await state(page)).distance).toBeGreaterThan(paused.distance + 10);
    expect((await state(page)).formation.heroZ).toBe(stationary.heroZ);
    expect((await state(page)).formation.roadZ).toBe(0);
    await page.screenshot({ path: '/tmp/topshooter-phone-playing.png' });
    await page.getByRole('button', { name: '暂停游戏' }).tap();
    const score = (await state(page)).score;
    await page.getByRole('button', { name: '结束并记录' }).tap();
    await expect(page.getByRole('button', { name: '开始挑战' })).toBeVisible();
    expect((await state(page)).troops).toBe(12);
    expect((await state(page)).records).toEqual([{ name: '触控射手', score }]);
    await page.reload();
    expect((await state(page)).records).toEqual([{ name: '触控射手', score }]);
    await page.getByRole('button', { name: '得分排行榜' }).tap();
    await expect(page.locator('#leaderboard-full')).toContainText('触控射手');
    await page.getByRole('button', { name: '关闭排行榜' }).tap();
    await page.getByRole('button', { name: '玩法提示', exact: true }).tap();
    await expect(page.getByRole('heading', { name: '火力与生存法则' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '追踪火箭', exact: false })).toBeVisible();
    await expect(page.getByRole('heading', { name: '扩军与锻造 · 没有上限' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Boss 生死战 · 8 秒击杀' })).toBeVisible();
    await page.getByRole('button', { name: '关闭玩法提示' }).tap();
    expect(errors).toEqual([]);
  });
});
test.describe('continuous desktop combat', () => {
  test.use({ viewport: { width: 1440, height: 960 } });
  test('continuous weapon growth, Boss health and timed survival pressure', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    const fullHeight = await page.locator('#game-frame').boundingBox();
    expect(fullHeight!.y).toBe(0); expect(fullHeight!.height).toBe(960);
    await page.getByRole('button', { name: '开始挑战' }).click();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await state(page)).x).toBeLessThan(-0.3);
    await page.mouse.move(720, 640); await page.mouse.down();
    await page.mouse.move(580, 640, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => (await state(page)).x).toBeLessThan(-2.5);
    await expect.poll(async () => (await state(page)).troops, { timeout: 9000 }).toBeGreaterThan(20);
    // Collect the opening gate, then actively aim at the central enemy stream.
    await page.mouse.move(580, 640); await page.mouse.down();
    await page.mouse.move(720, 640, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => Math.abs((await state(page)).x)).toBeLessThan(.3);
    await expect.poll(async () => (await state(page)).weapon, { timeout: 25000 }).toBeGreaterThanOrEqual(1);
    await page.mouse.move(720, 640); await page.mouse.down();
    await page.mouse.move(580, 640, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => (await state(page)).x).toBeLessThan(-2.5);
    await expect(page.locator('#boss-hud')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#boss-timer')).toContainText(/◆|\d+\.\ds/);
    expect(await page.locator('#boss-hp,#boss-demand,#boss-focus,.combat-strip,.growth-strip,.fever-banner').count()).toBe(0);
    const bossBar = await page.locator('#boss-hud').boundingBox();
    expect(bossBar!.height).toBeLessThan(60);
    await expect(page.locator('#gear-label')).toContainText('+');
    await expect(page.locator('#toast')).not.toHaveClass(/visible/);
    const current = await state(page);
    expect(current.status).toBe('playing'); expect(current.distance).toBeGreaterThan(50);
    expect(current.score).toBeGreaterThan(200); expect(current.difficulty).toBe(.7);
    expect(current.kills).toBeGreaterThan(1);
    expect(current.boss!.maxHp).toBeGreaterThan(0); expect(current.boss!.focus).toBe(0);
    await expect.poll(async () => (await state(page)).elapsed, { timeout: 5000 }).toBeGreaterThan(current.elapsed + 1.25);
    const advanced = await state(page);
    expect(advanced.status).toBe('playing');
    if (advanced.boss) {
      expect(advanced.boss.z).toBeGreaterThanOrEqual(current.boss!.z);
      expect(advanced.boss.z - current.boss!.z).toBeLessThanOrEqual(10 * (advanced.elapsed - current.elapsed) + .01);
    } else {
      expect(advanced.bossesKilled).toBeGreaterThan(current.bossesKilled);
    }
    expect(advanced.formation.roadZ).toBe(0); expect(advanced.formation.heroZ).toBe(.1);
    expect(advanced.formation.left).toBeGreaterThanOrEqual(0); expect(advanced.formation.right).toBeLessThanOrEqual(1);
    await page.screenshot({ path: '/tmp/topshooter-combat.png' });
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: '火力，稍作停留' })).toBeVisible();
    await page.getByRole('button', { name: '结束并记录' }).click();
    expect((await state(page)).records.length).toBe(1);
    expect(errors).toEqual([]);
  });
});

test('a new player can stay in a side lane and defeat the first Boss without precise aiming', async ({ page }) => {
  test.setTimeout(65000);
  await page.goto('/');
  await page.getByRole('button', { name: '开始挑战' }).click();
  await page.keyboard.down('ArrowLeft');
  await expect.poll(async () => (await state(page)).x).toBeLessThan(-2.9);
  await page.keyboard.up('ArrowLeft');
  await expect.poll(async () => (await state(page)).bossesKilled, { timeout: 50000 }).toBeGreaterThanOrEqual(1);
  expect((await state(page)).status).toBe('playing'); expect((await state(page)).troops).toBeGreaterThanOrEqual(8);
  await page.getByRole('button', { name: '暂停游戏' }).click();
  await page.getByRole('button', { name: '结束并记录' }).click();
  expect((await state(page)).records.length).toBe(1);
  expect((await state(page)).gear).toBe(0); expect((await state(page)).bossesKilled).toBe(0);
});

test('rhythm audio starts after interaction, advances beats and can be muted', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '开始挑战' }).click();
  const audioState = () => page.evaluate(() => (window as unknown as {
    __topShooter: { audio: { context: string; steps: number; enabled: boolean; active: boolean } };
  }).__topShooter.audio);
  await expect.poll(async () => (await audioState()).context).toBe('running');
  await expect.poll(async () => (await audioState()).steps).toBeGreaterThan(4);
  await page.getByRole('button', { name: '关闭声音' }).click();
  expect((await audioState()).enabled).toBe(false);
  await page.getByRole('button', { name: '开启声音' }).click();
  expect((await audioState()).enabled).toBe(true);
  await page.getByRole('button', { name: '暂停游戏' }).click();
  await expect.poll(async () => (await audioState()).active).toBe(false);
});

test('short phone screens keep the battlefield at full height and controls visible', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const layout = await page.locator('#game-frame').boundingBox();
  expect(layout!.y).toBe(0); expect(layout!.height).toBe(568);
  await expect(page.getByRole('button', { name: '开始挑战' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '得分排行榜' })).toBeInViewport();
  await expect(page.getByRole('button', { name: '玩法提示', exact: true })).toBeInViewport();
  await page.screenshot({ path: '/tmp/topshooter-small-phone.png' });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 960 }]) {
  test(`visible enemies above the old attack boundary are immediately targeted at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.clock.install();
    await page.goto('/');
    await page.getByRole('button', { name: '关闭声音' }).click();
    await page.getByRole('button', { name: '开始挑战' }).click();
    await page.clock.runFor(32);
    const before = await page.evaluate(() => (window as any).__topShooter.combat);
    expect(before.attackRange).toBe(70);
    const target = before.targets.find((t: any) => t.kind === 'enemy' &&
      t.z < -28 && before.projectiles.some((p: any) => p.target === t.id));
    expect(target).toBeDefined();
    expect(target.screenY).toBeGreaterThan(0);
    expect(target.screenY).toBeLessThan(.4);
    await page.clock.runFor(600);
    const after = await page.evaluate(id => (window as any).__topShooter.combat.targets.find((t: any) => t.id === id), target.id);
    expect(after?.hp ?? 0).toBeLessThan(target.hp);
  });
}
