import { expect, test } from '@playwright/test';
import { copyFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

let url: string;
test.beforeAll(async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'topshooter offline copy '));
  const destination = path.join(directory, '火力全开 offline game.html');
  await copyFile(path.resolve('game_topshooter.html'), destination);
  url = pathToFileURL(destination).href;
});
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('copied HTML opens offline, supports touch and audio, persists scores and returns home', async ({ page }) => {
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.goto(url);
  await expect(page.getByRole('button', { name: '开始挑战' })).toBeVisible();
  expect(await page.locator('script[src],link[rel="stylesheet"]').count()).toBe(0);
  const frame = await page.locator('#game-frame').boundingBox();
  expect(frame!.y).toBe(0); expect(frame!.height).toBe(844);
  const opening = await page.evaluate(() => ({
    pressure: (window as any).__topShooter.combat.enemyPressure,
    squads: (window as any).__topShooter.combat.targets.filter((t: any) => t.kind === 'enemy' && t.z >= -40).length,
  }));
  expect(opening.pressure).toBe(1.2); expect(opening.squads).toBe(3);
  await page.getByRole('textbox', { name: '射手代号' }).fill('离线射手');
  await page.getByRole('button', { name: '开始挑战' }).tap();
  const state = () => page.evaluate(() => (window as any).__topShooter);
  expect((await state()).name).toBe('Top Shooter');
  expect((await state()).bossCount).toBe(50); expect((await state()).effectCount).toBe(100);
  expect((await state()).weaponCount).toBe(20); expect((await state()).weaponLevel).toBe(1);
  expect((await state()).difficulty).toBe(.7); expect((await state()).speed).toBeCloseTo(8.925);
  expect((await state()).beginnerProtection).toBe(true);
  await expect.poll(async () => (await state()).audio.context).toBe('running');
  await expect.poll(async () => (await state()).audio.steps).toBeGreaterThan(4);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 590 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100, y: 590 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(async () => (await state()).x).toBeLessThan(-2);
  await expect.poll(async () => (await state()).score).toBeGreaterThan(80);
  await page.screenshot({ path: '/tmp/topshooter-offline-playing.png' });
  await page.getByRole('button', { name: '关闭声音' }).tap();
  expect((await state()).audio.enabled).toBe(false);
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await expect(page.getByRole('heading', { name: '火力，稍作停留' })).toBeVisible();
  const paused = (await state()).elapsed;
  await page.getByRole('button', { name: '继续挑战' }).tap();
  await expect.poll(async () => (await state()).elapsed).toBeGreaterThan(paused + .2);
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await page.getByRole('button', { name: '结束并记录' }).tap();
  const record = (await state()).records[0];
  expect(record.name).toBe('离线射手'); expect(record.score).toBeGreaterThan(0);
  await page.reload();
  expect((await state()).records).toEqual([record]);
  await page.getByRole('button', { name: '得分排行榜' }).tap();
  await expect(page.locator('#leaderboard-full')).toContainText('离线射手');
  await page.getByRole('button', { name: '关闭排行榜' }).tap();
  await page.getByRole('button', { name: '玩法提示', exact: true }).tap();
  for (const name of ['重锤暴君', '烈焰飞龙', '毒刺蝎后', '亡灵术士', '熔岩巨像', '镰刃死神', '雷冠君王', '三首寒蛇', '虚空魔眼', '深海触王']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeAttached();
  }
  await page.getByRole('button', { name: '关闭玩法提示' }).tap();
  await page.getByRole('button', { name: '开始挑战' }).tap();
  await page.getByRole('link', { name: 'Top Shooter 首页' }).tap();
  await expect(page.getByRole('button', { name: '开始挑战' })).toBeVisible();
  expect(page.url()).toBe(url);
  expect(errors).toEqual([]); expect(network).toEqual([]);
});

test('offline side-lane play defeats a rendered Boss under the easy opening', async ({ page }) => {
  test.setTimeout(65000);
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.goto(url);
  await page.getByRole('button', { name: '开始挑战' }).tap();
  await page.keyboard.down('ArrowLeft');
  await expect.poll(() => page.evaluate(() => (window as any).__topShooter.x)).toBeLessThan(-2.9);
  await page.keyboard.up('ArrowLeft');
  await expect(page.locator('#boss-hud')).toBeVisible({ timeout: 25000 });
  await expect(page.locator('#boss-name')).toContainText('重锤暴君');
  await expect.poll(() => page.evaluate(() => {
    const boss = (window as any).__topShooter.boss;
    return !!boss && boss.z < -28 && boss.hp < boss.maxHp && boss.seconds < 0;
  }), { timeout: 5000 }).toBe(true);
  await page.screenshot({ path: '/tmp/topshooter-offline-boss.png' });
  await expect.poll(() => page.evaluate(() => (window as any).__topShooter.bossesKilled), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => (window as any).__topShooter.status)).toBe('playing');
  await page.getByRole('button', { name: '暂停游戏' }).tap();
  await page.getByRole('button', { name: '结束并记录' }).tap();
  expect(await page.evaluate(() => (window as any).__topShooter.records.length)).toBe(1);
  expect(errors).toEqual([]); expect(network).toEqual([]);
});

test('offline negative gates visibly grow under real firing and cross into positive numbers', async ({ page }) => {
  test.setTimeout(75000);
  await page.clock.install();
  await page.goto(url);
  await page.getByRole('button', { name: '关闭声音' }).tap();
  await page.getByRole('button', { name: '开始挑战' }).tap();
  const gates = () => page.evaluate(() => (window as any).__topShooter.gates as { id: number; x: number; z: number; value: number; operation: string }[]);
  let target: { id: number; x: number; z: number; value: number } | undefined;
  // Advance browser time in normal animation steps: slower travel delays the third gate pair.
  for (let i = 0; i < 90 && !target; i++) {
    await page.clock.runFor(1000);
    target = (await gates()).find(g => g.operation === 'add' && g.value < 0 && g.z > -27 && g.z < -19);
  }
  expect(target).toBeDefined();
  const id = target!.id, original = target!.value;
  const key = target!.x < 0 ? 'ArrowLeft' : 'ArrowRight';
  await page.keyboard.down(key);
  await page.clock.runFor(650);
  expect(await page.evaluate(sign => (window as any).__topShooter.x * sign, Math.sign(target!.x))).toBeGreaterThan(1.8);
  await page.keyboard.up(key);
  let enhanced = original;
  for (let i = 0; i < 28 && enhanced < 10; i++) {
    await page.clock.runFor(250);
    enhanced = (await gates()).find(g => g.id === id)?.value ?? enhanced;
  }
  expect(enhanced).toBeGreaterThan(original + 20); expect(enhanced).toBeGreaterThanOrEqual(10);
  await page.screenshot({ path: '/tmp/topshooter-offline-gate.png' });
});

test('offline multiplication and forge gates require sustained aimed firing and award their upgraded values', async ({ page }) => {
  test.setTimeout(100000);
  for (const operation of ['multiply', 'forge']) {
    await page.goto(url);
    await page.getByRole('button', { name: '开始挑战' }).tap();
    const state = () => page.evaluate(() => (window as any).__topShooter);
    let target: { id: number; x: number; value: number } | undefined;
    await expect.poll(async () => {
      target = (await state()).gates.find((g: any) => g.operation === operation && g.z > -28 && g.z < -24);
      // The free starting multiplication gate is already inside this range.
      if (operation === 'multiply') target ??= (await state()).gates.find((g: any) => g.operation === operation && g.z < -8);
      return !!target;
    }, { timeout: 50000, intervals: [50] }).toBe(true);
    const id = target!.id, original = target!.value;
    const key = target!.x < 0 ? 'ArrowLeft' : 'ArrowRight';
    await page.keyboard.down(key);
    await expect.poll(async () => (await state()).x * Math.sign(target!.x), { intervals: [20] }).toBeGreaterThan(1.8);
    await page.keyboard.up(key);
    if (operation === 'forge') {
      const before = (await state()).gates.find((g: any) => g.id === id);
      expect(before.value).toBe(original);
      await expect.poll(async () => (await state()).gates.find((g: any) => g.id === id)?.charge ?? 0, { intervals: [50] }).toBeGreaterThan(.4);
      expect((await state()).gates.find((g: any) => g.id === id).value).toBe(original);
    }
    await expect.poll(async () => (await state()).gates.find((g: any) => g.id === id)?.value ?? original,
      { timeout: 4000, intervals: [20] }).toBeGreaterThan(original);
    await page.screenshot({ path: `/tmp/topshooter-offline-${operation}.png` });
    const enhanced = (await state()).gates.find((g: any) => g.id === id);
    expect(enhanced.value).toBeLessThanOrEqual(enhanced.limit);
    const gear = (await state()).gear;
    await expect.poll(async () => (await state()).gates.some((g: any) => g.id === id), { timeout: 13000, intervals: [50] }).toBe(false);
    if (operation === 'forge') expect((await state()).gear).toBeGreaterThanOrEqual(gear + enhanced.value);
  }
});

test('copied offline HTML clears at least three Bosses with only a side-lane input and normal resources', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (/^https?:/.test(r.url())) network.push(r.url()); });
  await page.clock.install();
  await page.goto(url);
  await page.getByRole('button', { name: '关闭声音' }).tap();
  await page.getByRole('button', { name: '开始挑战' }).tap();
  await page.keyboard.down('ArrowRight'); await page.clock.runFor(500); await page.keyboard.up('ArrowRight');
  const runs: { bosses: number; troops: number; difficulty: number; seconds: number }[] = [];
  for (let i = 0; i < 12; i++) {
    await page.clock.runFor((runs.at(-1)?.bosses ?? 0) >= 2 ? 2000 : 15000);
    const state = await page.evaluate(() => (window as any).__topShooter);
    runs.push({ bosses: state.bossesKilled, troops: state.troops, difficulty: state.difficulty, seconds: state.elapsed });
    if (state.bossesKilled >= 3) break;
    expect(state.status).toBe('playing'); expect(state.troops).toBeGreaterThanOrEqual(8);
  }
  const final = runs.at(-1)!;
  expect(final.bosses).toBeGreaterThanOrEqual(3); expect(final.difficulty).toBeLessThanOrEqual(.731);
  await page.screenshot({ path: '/tmp/topshooter-beginner-three-bosses.png' });
  console.log(JSON.stringify({ offlineBeginner: runs })); expect(errors).toEqual([]); expect(network).toEqual([]);
});
