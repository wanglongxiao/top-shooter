import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTACK_RANGE, BOSS_DUEL_RANGE, BOSS_TYPES, BOSS_EFFECTS, bossInfo, Engine, ENEMY_PRESSURE, GAME_PACE, OPENING_FACTOR, MAX_DIFFICULTY, WEAPONS, FINAL_WEAPON, FINAL_WEAPON_XP, MASTERY_XP_STEP, type Entity, type EnemyType, type GameEvent } from '../src/engine.ts';
import { AudioMixGate } from '../src/audio-mix.ts';
import { normalizeRecords } from '../src/leaderboard.ts';
import { seededRandom, steer, novicePlayer } from './strategy.ts';

function advance(game: Engine, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds * 60) && game.status === 'playing'; i++) game.update(1 / 60);
}
function isolated(type: EnemyType = 'raider', hp = 100) {
  const game = new Engine(() => {}, () => 0.4);
  const enemy = game.entities.find(e => e.kind === 'enemy')!;
  enemy.archetype = type; enemy.hp = enemy.maxHp = hp; enemy.x = enemy.homeX = 0; enemy.z = -15;
  game.entities = [enemy]; game.start();
  return { game, enemy };
}

test('easy opening uses 0.7 difficulty and speed while player firepower and the duel stay intact', () => {
  const game = new Engine(); game.start(); advance(game, 1);
  assert.ok(Math.abs(game.distance - 17 * GAME_PACE * OPENING_FACTOR) < .001);
  assert.equal(new Engine().speed, 17 * GAME_PACE * OPENING_FACTOR);
  assert.equal(new Engine().difficulty, .7);
  assert.equal(new Engine().fireInterval, WEAPONS[0].interval / GAME_PACE);
  const { game: duel, enemy } = isolated('brute', 1e15);
  enemy.kind = 'boss'; enemy.z = -28; enemy.bossTime = 8; enemy.attackTimer = 99;
  advance(duel, 8);
  assert.equal(duel.status, 'defeat');
  assert.equal(game.status, 'playing');
});
test('difficulty rises gently with Boss kills, from 0.7 to 0.8 across the first ten and caps at 3', () => {
  const game = new Engine();
  game.elapsed = 0; const d0 = game.difficulty, v0 = game.speed;
  game.elapsed = 300;
  assert.equal(game.difficulty, d0); assert.equal(game.speed, v0);
  for (const [count, expected] of [[1, .71], [3, .73], [9, .79], [10, .8], [11, .82], [20, 1], [119, 2.98], [120, 3], [10000, 3]]) {
    game.bossesKilled = count;
    assert.ok(Math.abs(game.difficulty - expected) < .0001);
    assert.ok(Math.abs(game.speed / v0 - expected / d0) < .0001);
  }
  game.fever = 6; assert.ok(game.speed <= 17 * GAME_PACE * MAX_DIFFICULTY);
});
test('the first enemy wave includes immediate reinforcements and resets consistently', () => {
  const game = new Engine(() => {}, () => .4);
  const opening = () => game.entities.filter(e => e.kind === 'enemy' && e.z >= -40);
  assert.equal(opening().length, 3);
  assert.ok(opening().some(e => e.x < 0) && opening().some(e => e.x > 0));
  const layout = opening().map(e => [e.x, e.z, e.archetype, e.hp]);
  game.start(); advance(game, 5); game.reset();
  assert.deepEqual(opening().map(e => [e.x, e.z, e.archetype, e.hp]), layout);
});
test('the first mage attack is earlier and its interval and projectile speed carry the 20 percent boost', () => {
  const { game, enemy } = isolated('mage', 1e9);
  enemy.z = -30;
  assert.ok(Math.abs(enemy.attackTimer - 1.65 / ENEMY_PRESSURE) < 1e-9);
  advance(game, 1.2); assert.equal(game.threats.length, 0);
  advance(game, .2); assert.equal(game.threats.length, 3);
  assert.ok(enemy.attackTimer <= 2.1 / (GAME_PACE * OPENING_FACTOR * ENEMY_PRESSURE));
  assert.ok(enemy.attackTimer > 2.1 / (GAME_PACE * OPENING_FACTOR * ENEMY_PRESSURE) - .05);
  assert.ok(game.threats.every(t => Math.abs(t.speed - 20 * game.encounterPace * ENEMY_PRESSURE) < 1e-9));
});
test('all fifty Bosses have boosted attack frequency and projectiles from their first skill', () => {
  for (const type of BOSS_TYPES) {
    const { game, enemy } = isolated(type, 1e9);
    enemy.kind = 'boss'; enemy.z = -24; enemy.bossTime = 7; enemy.attackTimer = 0;
    game.update(.001);
    const info = bossInfo(type);
    assert.ok(Math.abs(enemy.attackTimer - info.interval * .87 / (game.difficulty * ENEMY_PRESSURE)) < 1e-9);
    const threats = game.threats.filter(t => t.source === enemy.id);
    assert.ok(threats.length > 0);
    assert.ok(threats.every(t => Math.abs(t.speed - info.skills[0].speed * game.encounterPace * ENEMY_PRESSURE) < 1e-9));
  }
});
test('gate choices are consumed together and cannot be claimed twice', () => {
  const game = new Engine(); const [a, b] = game.entities;
  game.applyGate(a); const army = game.troops;
  game.applyGate(b);
  assert.equal(game.troops, army); assert.equal(a.active, false); assert.equal(b.active, false);
});
test('recruitment and multiplication have no gameplay cap and all troops add damage', () => {
  const game = new Engine(); game.troops = 1000000;
  const before = game.dps; game.applyGate(game.entities[1]);
  assert.equal(game.troops, 2000000); assert.ok(game.dps > before * 1.99);
});
test('the center corridor cannot accidentally claim either gate', () => {
  const game = new Engine(); game.start(); advance(game, 1);
  assert.equal(game.troops, 12);
});
test('forging trades eight percent of troops for an uncapped gear level without breaking combo', () => {
  const game = new Engine(); const gate = game.entities[0]; game.troops = 1000; game.combo = 12;
  gate.operation = 'forge'; gate.value = 1;
  for (let i = 0; i < 30; i++) { gate.active = true; game.applyGate(gate); }
  assert.equal(game.gearLevel, 30); assert.equal(game.power, 8.5); assert.equal(game.combo, 12);
  assert.ok(game.troops < 1000 && game.troops > 0);
});
test('pause freezes score, difficulty, distance, bullets and threats', () => {
  const { game } = isolated('mage'); advance(game, 0.5); game.pause();
  const before = { score: game.score, elapsed: game.elapsed, distance: game.distance, bullets: JSON.stringify(game.bullets), threats: JSON.stringify(game.threats) };
  for (let i = 0; i < 100; i++) game.update(0.1);
  assert.deepEqual({ score: game.score, elapsed: game.elapsed, distance: game.distance, bullets: JSON.stringify(game.bullets), threats: JSON.stringify(game.threats) }, before);
});
test('a slow rendering frame preserves elapsed time through collision substeps', () => {
  const a = new Engine(() => {}, () => 0.4), b = new Engine(() => {}, () => 0.4);
  a.start(); b.start(); a.update(0.2); advance(b, 0.2);
  assert.ok(Math.abs(a.distance - b.distance) < 0.001);
  assert.ok(Math.abs(a.elapsed - 0.2) < 0.001);
});
test('automatic rapid fire awards score and starts a combo', () => {
  const { game, enemy } = isolated('raider', 10); advance(game, 0.6);
  assert.equal(enemy.active, false); assert.equal(game.kills, 1);
  assert.ok(game.score >= 60); assert.equal(game.combo, 1);
});
for (const kind of ['enemy', 'barrel', 'boss', 'add', 'multiply', 'forge'] as const) {
  test(`visible ${kind} can be targeted and hit at the far edge of the battlefield`, () => {
    const { game, enemy } = isolated('raider', 1000);
    enemy.z = -ATTACK_RANGE;
    if (kind === 'add' || kind === 'multiply' || kind === 'forge') {
      enemy.kind = 'gate'; enemy.operation = kind;
      enemy.value = kind === 'add' ? -50 : kind === 'multiply' ? 2 : 1;
      enemy.gateLimit = kind === 'add' ? 30 : kind === 'multiply' ? 2.5 : 3;
    } else {
      enemy.kind = kind;
      if (kind === 'boss') { enemy.archetype = 'brute'; enemy.bossTime = -1; enemy.attackTimer = 99; }
    }
    const value = enemy.value;
    game.update(1 / 60);
    assert.ok(game.bullets.some(b => b.target === enemy.id));
    advance(game, 1.2);
    assert.ok(enemy.z < -BOSS_DUEL_RANGE);
    if (kind === 'add') assert.ok(enemy.value > value);
    else if (kind === 'multiply' || kind === 'forge') assert.ok(enemy.gateCharge > 0 || enemy.value > value);
    else assert.ok(enemy.hp < enemy.maxHp);
    if (kind === 'boss') assert.equal(enemy.bossTime, -1);
  });
}
test('offscreen targets wait until they enter the rendered battlefield', () => {
  const { game, enemy } = isolated('raider', 1000);
  enemy.z = -ATTACK_RANGE - 1;
  game.update(1 / 60);
  assert.ok(game.bullets.every(b => b.target !== enemy.id));
  advance(game, .3);
  assert.ok(game.bullets.some(b => b.target === enemy.id));
});
test('untargeted shots travel through the whole battlefield before being removed', () => {
  const game = new Engine(); game.entities = []; game.start(); game.update(1 / 60);
  const ids = new Set(game.bullets.map(b => b.id));
  advance(game, .95);
  assert.ok(game.bullets.some(b => ids.has(b.id) && b.z < -48));
  advance(game, .2);
  assert.ok(game.bullets.every(b => !ids.has(b.id)));
});
test('four combat experience points evolve the first weapon', () => {
  const events: GameEvent[] = [];
  const { game, enemy } = isolated('raider', 1);
  game.onEvent = event => events.push(event);
  game.weaponXP = 3; advance(game, 0.5);
  assert.equal(enemy.active, false); assert.equal(game.weapon, 1);
  assert.ok(events.some(e => e.type === 'upgrade'));
});
test('supply destruction adds firepower, experience and six soldiers', () => {
  const { game, enemy } = isolated('raider', 1); enemy.kind = 'barrel';
  advance(game, 0.5);
  assert.equal(game.troops, 18); assert.equal(game.weaponXP, 3); assert.equal(game.power, 1.25);
  assert.equal(game.gearLevel, 1);
});
test('shield troops reduce ordinary arrow damage', () => {
  const a = isolated('guard', 100), b = isolated('raider', 100);
  advance(a.game, 0.5); advance(b.game, 0.5);
  assert.ok(a.enemy.hp > b.enemy.hp);
});
test('flame weapons ignite targets with continuing burn damage', () => {
  const { game, enemy } = isolated('guard', 1000);
  game.weapon = 2; game.weaponXP = 10; advance(game, 0.4);
  assert.ok(enemy.burn > 0); assert.ok(enemy.burnDamage > 0);
});
test('lightning actually chains damage to neighboring enemies', () => {
  const { game, enemy } = isolated('raider', 20);
  const next = { ...enemy, id: 900, hp: 100, maxHp: 100, x: 1.5, z: -17 };
  game.entities.push(next); game.weapon = 3; game.weaponXP = 18;
  const events: GameEvent[] = []; game.onEvent = e => events.push(e);
  advance(game, 0.45);
  assert.ok(events.some(e => e.type === 'chain')); assert.ok(next.hp < 100);
});
test('rocket explosions damage nearby enemies', () => {
  const { game, enemy } = isolated('raider', 1000);
  const next = { ...enemy, id: 901, hp: 1000, x: 1.5, z: -16 };
  game.entities.push(next); game.weapon = 4; game.weaponXP = 30;
  advance(game, 0.6); assert.ok(next.hp < 1000);
});
test('mages launch hostile projectiles without waiting for collision', () => {
  const { game, enemy } = isolated('mage', 1000); enemy.attackTimer = 0;
  game.update(0.02); assert.equal(game.threats.length, 3);
});
test('hostile projectiles cause damage and break a kill streak', () => {
  const game = new Engine(); game.start(); game.combo = 9; game.comboTimer = 3;
  game.threats = [{ id: 991, x: 0, z: -0.3, vx: 0, speed: 20, damage: 3, radius: 0.32 }];
  game.update(0.02); assert.equal(game.troops, 9); assert.equal(game.combo, 0);
});
test('rage triggers a timed frenzy and doubles the current score multiplier', () => {
  const { game } = isolated('raider', 1); game.rage = 0.99; game.combo = 4; game.comboTimer = 3;
  advance(game, 0.35); assert.ok(game.fever > 0); assert.equal(game.multiplier, 4);
});
test('bosses join the same continuous run without clearing or resetting the arena', () => {
  const game = new Engine(() => {}, () => 0.4); game.start(); game.elapsed = 17.99;
  const previous = game.distance; game.update(0.05);
  assert.equal(game.status, 'playing'); assert.ok(game.distance > previous);
  assert.ok(game.entities.some(e => e.kind === 'boss' && e.archetype === 'brute'));
});
test('continuous spawning and restarts stay bounded through ten minutes of real move-only simulation', () => {
  const game = new Engine(() => {}, seededRandom(1)); game.start();
  let maxArmy = game.troops, restarts = 0, bosses = 0;
  for (let i = 0; i < 60 * 600; i++) {
    steer(game); game.update(1 / 60); maxArmy = Math.max(maxArmy, game.troops);
    assert.ok(game.entities.length < 80); assert.ok(game.bullets.length <= 180); assert.ok(game.threats.length <= 160);
    assert.ok(game.strikes.length <= 16);
    if (game.status === 'defeat' || (i > 0 && i % (180 * 60) === 0)) { restarts++; bosses += game.bossesKilled; game.reset(); game.start(); }
  }
  assert.ok(restarts >= 3); assert.ok(bosses + game.bossesKilled >= 10); assert.ok(maxArmy > 200);
});
test('defeat and restart reset all score, combo, weapon and hazard state', () => {
  const { game, enemy } = isolated('brute', 10000);
  enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = 0.001; game.update(0.02);
  assert.equal(game.status, 'defeat'); game.reset();
  assert.equal(game.score, 0); assert.equal(game.weapon, 0); assert.equal(game.troops, 12);
  assert.equal(game.combo, 0); assert.equal(game.threats.length, 0); assert.equal(game.status, 'ready');
  assert.equal(game.gearLevel, 0); assert.equal(game.bossesKilled, 0); assert.equal(game.peakDps, 0); assert.equal(game.defeatReason, '');
});
test('a live Boss executes the entire army in either edge lane despite frenzy and damage immunity', () => {
  for (const side of [-3, 3]) {
    const { game, enemy } = isolated('brute', 1e15);
    enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = 0.005;
    game.troops = 1e9; game.x = game.targetX = side; game.fever = 5;
    game.threats = [{ id: 900, x: side, z: -.3, vx: 0, speed: 20, damage: 1, radius: .32 }];
    game.update(.001); // Establish the ordinary damage cooldown.
    assert.equal(game.status, 'playing');
    game.update(.01);
    assert.equal(game.status, 'defeat'); assert.equal(game.troops, 0); assert.match(game.defeatReason, /斩杀/);
  }
});
test('the final tick exact-zero projectile kill wins over the Boss execution', () => {
  const { game, enemy } = isolated('brute', 10000);
  enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = .001;
  game.bullets = [{ id: 900, x: 0, z: -17.9, target: enemy.id, damage: 10000, weapon: 0 }];
  game.update(1 / 60);
  assert.equal(enemy.hp, 0); assert.equal(enemy.active, false);
  assert.equal(game.status, 'playing'); assert.equal(game.bossesKilled, 1); assert.equal(game.gearLevel, 1);
});
test('a final tick burn kill also wins over execution', () => {
  const { game, enemy } = isolated('brute', 10);
  enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = .001;
  enemy.burn = 1; enemy.burnDamage = 600;
  game.update(1 / 60);
  assert.equal(enemy.hp, 0); assert.equal(game.status, 'playing'); assert.equal(game.bossesKilled, 1);
});
test('Boss locks a readable ground strike before damage and moving out dodges it', () => {
  const a = isolated('brute', 1e9), b = isolated('brute', 1e9);
  for (const { game, enemy } of [a, b]) {
    enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = 8; enemy.attackTimer = 0; game.troops = 10000;
    game.update(.02);
    assert.equal(game.strikes.length, 1); assert.ok(game.strikes[0].timer > .8); assert.equal(game.troops, 10000);
    game.threats = [];
  }
  const settle = a.game.strikes[0].timer + .05;
  b.game.move(1.1); advance(a.game, settle); advance(b.game, settle);
  assert.equal(a.game.troops, 7900); assert.equal(b.game.troops, 10000);
});
test('at maximum difficulty Boss aim still rewards sustained tracking and reduces off-axis fire', () => {
  const a = isolated('brute', 1e9), b = isolated('brute', 1e9);
  for (const { game, enemy } of [a, b]) { enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = 8; enemy.attackTimer = 99; game.troops = 100; game.bossesKilled = 120; }
  b.game.x = b.game.targetX = 3;
  advance(a.game, 1.2); advance(b.game, 1.2);
  assert.equal(a.enemy.focus, 1); assert.equal(b.enemy.focus, 0);
  assert.ok((1e9 - a.enemy.hp) > (1e9 - b.enemy.hp) * 5);
});
test('locked multiplication gates must be shot open before they grant soldiers', () => {
  const { game, enemy } = isolated('raider', 10);
  enemy.kind = 'gate'; enemy.operation = 'multiply'; enemy.value = 2; enemy.gateLimit = 2.5; enemy.locked = true;
  enemy.hp = enemy.maxHp = 1; enemy.z = -27; advance(game, .3);
  assert.equal(enemy.locked, true);
  advance(game, 1.15);
  assert.equal(enemy.locked, false); assert.equal(enemy.active, true); assert.equal(game.troops, 12);
  game.applyGate(enemy); assert.equal(game.troops, 24); assert.equal(game.kills, 0);
});
test('uncleared multiplication shields never award troops', () => {
  const game = new Engine(); const gate = game.entities[1]; gate.locked = true;
  game.applyGate(gate); assert.equal(game.troops, 12); assert.equal(gate.active, false);
});
test('weapon experience keeps raising mastery and damage past the final weapon', () => {
  const { game, enemy } = isolated('raider', 1);
  game.weapon = FINAL_WEAPON; game.weaponXP = FINAL_WEAPON_XP + 101 * MASTERY_XP_STEP - 1;
  const before = game.dps; advance(game, .5);
  assert.equal(enemy.active, false); assert.equal(game.mastery, 101); assert.ok(game.dps > before);
});
test('Boss health grows with current firepower rather than idle survival time', () => {
  const game = new Engine(() => {}, seededRandom(1)); game.start(); game.elapsed = 17.99; game.update(.02);
  const first = game.boss!.maxHp;
  game.entities = []; game.elapsed = 35.99; game.troops = 1000; game.update(.03);
  assert.ok(game.boss!.maxHp > first * 2);
});
test('Boss advances continuously at controlled speeds without retreating, even at extreme enemy speed', () => {
  const { game, enemy } = isolated('brute', 1e15);
  enemy.kind = 'boss'; enemy.z = -45; enemy.attackTimer = 99;
  game.elapsed = 300; game.fever = 100; game.troops = 1e8; game.x = game.targetX = 3;
  const start = game.elapsed;
  let previous = enemy.z, contact = false;
  for (let i = 0; i < 1400 && game.status === 'playing'; i++) {
    game.update(1 / 60);
    if (!contact && enemy.bossTime >= 0) { enemy.hp = enemy.maxHp = 1e15; contact = true; }
    assert.ok(enemy.z >= previous - 1e-9, `Boss retreated from ${previous} to ${enemy.z}`);
    assert.ok(enemy.z - previous <= 10 * GAME_PACE / 60 + 1e-9);
    previous = enemy.z;
  }
  assert.equal(game.status, 'defeat'); assert.match(game.defeatReason, /斩杀/);
  assert.ok(Math.abs(game.elapsed - start - (8 + 17 / (7.5 * OPENING_FACTOR))) < .02);
  assert.ok(Math.abs(enemy.z - (-28 + 27 * GAME_PACE * OPENING_FACTOR)) < .01);
});
test('a close Boss never gets teleported backwards into the duel lane', () => {
  const { game, enemy } = isolated('brute', 1e12);
  enemy.kind = 'boss'; enemy.z = -4; enemy.bossTime = 1.5; enemy.attackTimer = 99;
  game.update(.25);
  assert.ok(enemy.z >= -4); assert.ok(enemy.z <= -2.5); assert.equal(game.status, 'playing');
});
test('the same calibrated Boss rewards accurate tracking and punishes a late response at the threshold', () => {
  const results = [];
  for (const late of [false, true]) {
    const { game, enemy } = isolated('brute');
    game.troops = 100; game.gearLevel = 5; game.power = 2.25; game.weapon = 4; game.weaponXP = 60; game.elapsed = 18;
    game.bossesKilled = 120;
    enemy.kind = 'boss'; enemy.z = -28; enemy.bossTime = 8; enemy.attackTimer = 99;
    enemy.hp = enemy.maxHp = game.bossHealthBudget;
    if (late) game.x = game.targetX = 3;
    const start = game.elapsed;
    for (let i = 0; i < 482 && game.status === 'playing' && enemy.active; i++) {
      game.entities = [enemy]; // Controlled duel without ambient rewards or hazards.
      if (late && game.elapsed - start > 4) game.move(0);
      game.update(1 / 60);
    }
    results.push({ game, enemy });
  }
  assert.equal(results[0].enemy.maxHp, results[1].enemy.maxHp);
  assert.equal(results[0].enemy.active, false); assert.equal(results[0].game.status, 'playing');
  assert.ok(results[0].enemy.bossTime > 1.5 && results[0].enemy.bossTime < 3);
  assert.equal(results[1].game.status, 'defeat');
  assert.ok(results[1].enemy.hp / results[1].enemy.maxHp > .15 && results[1].enemy.hp / results[1].enemy.maxHp < .4);
});
test('lost troops do not inherit an impossible health budget from an obsolete peak firepower', () => {
  const game = new Engine(); game.elapsed = 180; game.troops = 1e6; game.peakDps = 1e15; game.gearLevel = 8; game.power = 3;
  const strong = game.bossHealthBudget;
  game.troops = 100;
  assert.ok(game.bossHealthBudget < strong / 100);
  const normal = game.bossHealthBudget; game.fever = 6;
  assert.ok(game.bossHealthBudget > normal); assert.ok(game.bossHealthBudget < normal * 3);
});
test('enemy troops rush toward the stationary player while projectile speed remains independent of enemy pace', () => {
  const a = isolated('guard', 1e9), b = isolated('guard', 1e9); b.game.bossesKilled = 10;
  for (const { game, enemy } of [a, b]) {
    enemy.z = -50;
    game.threats = [{ id: 900, x: 0, z: -20, vx: 0, speed: 20, damage: 1, radius: .32 }];
    game.update(.02); assert.ok(enemy.z > -50);
  }
  assert.ok(b.enemy.z > a.enemy.z);
  assert.equal(a.game.threats[0].z, b.game.threats[0].z);
});
test('large armies still lose a meaningful share to hostile projectiles', () => {
  const game = new Engine(); game.start(); game.troops = 1000000;
  game.threats = [{ id: 991, x: 0, z: -.3, vx: 0, speed: 20, damage: 3, radius: .32 }];
  game.update(.02); assert.equal(game.troops, 930000);
});
test('firepower-adapted enemy health cannot turn one ordinary collision into an instant army wipe', () => {
  const { game, enemy } = isolated('guard', 1e15);
  game.troops = 1000; game.gearLevel = 1000; game.power = 251; enemy.z = -.2;
  game.update(.02);
  assert.equal(enemy.active, false);
  assert.ok(game.troops >= 500 && game.troops < 1000);
  assert.equal(game.status, 'playing');
});
test('passive edge play clears three Bosses and active upgrading clears ten on five maps', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const passive = new Engine(() => {}, seededRandom(seed)); passive.start(); passive.move(-3);
    for (let i = 0; i < 180 * 60 && passive.status === 'playing' && passive.bossesKilled < 3; i++) passive.update(1 / 60);
    const skilled = new Engine(() => {}, seededRandom(seed)); skilled.start();
    for (let i = 0; i < 360 * 60 && skilled.status === 'playing' && skilled.bossesKilled < 10; i++) { steer(skilled); skilled.update(1 / 60); }
    assert.equal(passive.bossesKilled, 3); assert.equal(skilled.bossesKilled, 10);
    assert.ok(skilled.gearLevel >= 10); assert.ok(passive.gearLevel >= 3);
  }
});
test('all fifty Top Shooter Boss types rotate in the continuous run and reset to the first type', () => {
  const game = new Engine(() => {}, seededRandom(2));
  game.start();
  const types: EnemyType[] = [];
  for (let i = 0; i < BOSS_TYPES.length; i++) {
    game.entities = []; game.elapsed = 18 * (i + 1) + .1; game.update(.02);
    types.push(game.boss!.archetype);
  }
  assert.deepEqual(types, [...BOSS_TYPES]);
  game.reset(); game.start(); game.elapsed = 18; game.update(.02);
  assert.equal(game.boss?.archetype, 'brute');
});
test('Top Shooter has fifty distinct Bosses and one hundred rendered effect recipes', () => {
  assert.equal(BOSS_TYPES.length, 50);
  assert.equal(new Set(BOSS_TYPES).size, 50);
  assert.equal(new Set(BOSS_TYPES.map(type => bossInfo(type).name)).size, 50);
  assert.equal(new Set(BOSS_TYPES.map(type => `${bossInfo(type).body}_${bossInfo(type).variant}`)).size, 50);
  assert.equal(BOSS_EFFECTS.length, 100);
  assert.equal(new Set(BOSS_EFFECTS.map(effect => effect.id)).size, 100);
  assert.equal(new Set(BOSS_EFFECTS.map(effect => effect.style)).size, 10);
  assert.equal(new Set(BOSS_EFFECTS.map(({ id, style, ...effect }) => JSON.stringify(effect))).size, 10);
  assert.equal(new Set(BOSS_TYPES.flatMap(type => bossInfo(type).skills.map(skill => skill.name))).size, 100);
});
test('all one hundred Boss skills produce distinct telegraphs and preserve an escape lane', () => {
  const patterns = new Set<string>();
  const emitted = new Set<string>();
  for (const type of BOSS_TYPES) for (const slot of [0, 1]) {
    const { game, enemy } = isolated(type, 1e9);
    const skill = bossInfo(type).skills[slot], events: GameEvent[] = [];
    game.onEvent = event => events.push(event);
    enemy.kind = 'boss'; enemy.z = -24; enemy.bossTime = 7; enemy.attackTimer = 0;
    enemy.attackPhase = slot;
    game.troops = 10000; game.x = game.targetX = .4; game.update(.02);
    assert.ok(game.strikes.length >= 1);
    assert.ok(game.strikes.every(s => s.timer > .7 && s.color === skill.color && s.effectId === skill.effect.id));
    assert.ok(game.threats.every(t => t.color === skill.color && t.effectId === skill.effect.id));
    assert.ok(events.some(event => event.type === 'bossAttack' && event.skillName === skill.name));
    emitted.add(skill.effect.id);
    assert.equal(game.troops, 10000);
    const candidates = Array.from({ length: 61 }, (_, i) => i / 10 - 3);
    assert.ok(candidates.some(x => game.strikes.every(s => Math.abs(x - s.x) > s.radius + .1)), `${type} has no escape`);
    patterns.add(JSON.stringify({
      strikes: game.strikes.map(s => [Number(s.x.toFixed(2)), s.radius, s.duration]),
      projectiles: game.threats.map(t => [Number(t.vx.toFixed(2)), t.speed]),
      summons: game.entities.filter(e => e.kind === 'enemy').map(e => e.archetype),
    }));
    if (bossInfo(type).body === 'necromancer') assert.equal(game.entities.filter(e => e.kind === 'enemy').length, 2);
    advance(game, Math.max(...game.strikes.map(s => s.timer)) + .05);
    assert.ok(events.some(event => event.type === 'bossImpact' && event.effectId === skill.effect.id));
  }
  assert.ok(patterns.size >= 50);
  assert.equal(emitted.size, 100);
});
test('Boss low-health rage accelerates attacks once without healing or retreating', () => {
  for (const type of BOSS_TYPES) {
    const events: GameEvent[] = [];
    const { game, enemy } = isolated(type, 1e9); game.onEvent = e => events.push(e);
    enemy.kind = 'boss'; enemy.z = -24; enemy.bossTime = 7; enemy.hp = enemy.maxHp * .44; enemy.attackTimer = 0;
    const hp = enemy.hp, z = enemy.z;
    game.update(.02);
    assert.equal(enemy.enraged, true); assert.ok(enemy.hp <= hp); assert.ok(enemy.z > z);
    assert.ok(enemy.attackTimer < bossInfo(type).interval * .87 / game.difficulty);
    game.update(.02);
    assert.equal(events.filter(e => e.text?.includes('狂暴')).length, 1);
    assert.ok(game.strikes.every(s => s.timer >= .69));
  }
});
test('every Boss stays inside the bridge and advances at the same fair duel speed', () => {
  for (const type of BOSS_TYPES) {
    const { game, enemy } = isolated(type, 1e15);
    enemy.kind = 'boss'; enemy.z = -45; enemy.attackTimer = 99; game.troops = 1e6;
    let previous = enemy.z;
    for (let i = 0; i < 60 * 9 && game.status === 'playing'; i++) {
      game.update(1 / 60);
      assert.ok(enemy.z >= previous);
      assert.ok(enemy.z - previous <= 10 / 60 + 1e-8);
      assert.ok(Math.abs(enemy.x) <= 2);
      previous = enemy.z;
    }
  }
});
test('killing a Boss removes its pending ground strikes and projectiles', () => {
  const { game, enemy } = isolated('scorpion', 1000);
  enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = 7; enemy.attackTimer = 0;
  game.update(.02); assert.ok(game.strikes.length > 0); assert.ok(game.threats.length > 0);
  game.bullets = [{ id: 999, x: 0, z: enemy.z, target: enemy.id, damage: 10000, weapon: 0 }];
  game.update(.02);
  assert.equal(enemy.active, false); assert.equal(game.strikes.length, 0); assert.equal(game.threats.length, 0);
});
test('sustained weapon fire turns a minus-fifty gate into a positive twenty-plus reward before collection', () => {
  const { game, enemy } = isolated('raider');
  enemy.kind = 'gate'; enemy.operation = 'add'; enemy.value = -50; enemy.gateLimit = 30; enemy.z = -27;
  const troops = game.troops;
  advance(game, 2.98);
  assert.ok(enemy.active); assert.ok(enemy.value >= 20); assert.equal(game.troops, troops);
  const reward = enemy.value;
  game.applyGate(enemy); game.applyGate(enemy);
  assert.equal(game.troops, troops + reward); assert.equal(game.kills, 0);
});
function investmentGate(operation: Entity['operation'], value: number, locked = false, troops = 12, weapon = 0) {
  const game = new Engine(() => {}, () => .4), gate = game.entities[0];
  gate.operation = operation; gate.value = value; gate.locked = locked;
  gate.gateLimit = operation === 'multiply' ? value + .5 : operation === 'forge' ? value + 2 : Math.max(0, value) + 30;
  gate.x = 0; gate.z = -15; gate.gateCharge = 0; gate.hp = gate.maxHp = 1;
  game.entities = [gate]; game.troops = troops; game.weapon = weapon; game.weaponXP = WEAPONS[weapon].unlock; game.start();
  const invest = (seconds: number) => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) {
      game.entities = [gate]; gate.z = -15; game.update(1 / 60);
    }
  };
  return { game, gate, invest };
}
test('real firing upgrades recruitment first, multiplication second and forging last', () => {
  const a = investmentGate('add', 10), b = investmentGate('multiply', 2), c = investmentGate('forge', 1);
  for (const fixture of [a, b, c]) fixture.invest(.5);
  assert.ok(a.gate.value > 10); assert.equal(b.gate.value, 2); assert.equal(c.gate.value, 1);
  for (const fixture of [a, b, c]) fixture.invest(.5);
  assert.ok(b.gate.value > 2); assert.equal(c.gate.value, 1);
  c.invest(1.9); assert.equal(c.gate.value, 2);
});
test('all three gates have finite per-gate rewards even under a million-strong rocket army', () => {
  for (const [operation, value, limit] of [['add', -50, 30], ['multiply', 2, 2.5], ['forge', 1, 3]] as const) {
    const fixture = investmentGate(operation, value, false, 1e6, 4);
    fixture.invest(20); assert.equal(fixture.gate.value, limit);
    fixture.invest(5); assert.equal(fixture.gate.value, limit);
  }
});
test('army size and frenzy cannot bypass the time required to improve special gates', () => {
  const small = investmentGate('forge', 1), huge = investmentGate('forge', 1, false, 1e9, 4);
  huge.game.gearLevel = 1000; huge.game.power = 251; huge.game.fever = 6;
  small.invest(1); huge.invest(1);
  assert.equal(small.gate.value, 1); assert.equal(huge.gate.value, 1);
  small.invest(2); huge.invest(2);
  assert.equal(small.gate.value, 2); assert.equal(huge.gate.value, 2);
});
test('upgraded multiplication and forging values are applied once on collection', () => {
  const b = investmentGate('multiply', 2), c = investmentGate('forge', 1);
  b.invest(2); c.invest(3);
  const multiplied = Math.floor(b.game.troops * b.gate.value);
  b.game.applyGate(b.gate); b.game.applyGate(b.gate);
  assert.equal(b.game.troops, multiplied); assert.ok(multiplied > 24);
  c.game.applyGate(c.gate); c.game.applyGate(c.gate);
  assert.equal(c.game.gearLevel, 2); assert.equal(c.game.troops, 11);
});
test('Boss adaptation lowers pre-contact health after losses and preserves earned upgrades', () => {
  for (const troops of [20, 1000]) {
    const { game, enemy } = isolated('brute');
    game.troops = 100; enemy.kind = 'boss'; enemy.z = -28; enemy.bossTime = -1;
    const original = game.bossHealthBudget; enemy.hp = enemy.maxHp = original;
    game.troops = troops; const adjusted = game.bossHealthBudget; game.update(.001);
    assert.equal(enemy.maxHp, Math.min(original, adjusted));
    const frozen = enemy.maxHp; game.troops = 1e6; game.update(.01);
    assert.equal(enemy.maxHp, frozen);
  }
});
test('Boss damage from the approach is preserved when the duel health budget is frozen', () => {
  for (const troops of [20, 100, 1000]) {
    const { game, enemy } = isolated('brute');
    game.troops = 100; enemy.kind = 'boss'; enemy.z = -BOSS_DUEL_RANGE; enemy.bossTime = -1;
    const original = game.bossHealthBudget, damage = original * .1;
    enemy.maxHp = original; enemy.hp = original - damage;
    game.troops = troops;
    const budget = Math.min(original, game.bossHealthBudget);
    game.update(.001);
    assert.equal(enemy.maxHp, budget);
    assert.ok(Math.abs(enemy.hp - (budget - damage)) < 1e-9);
    assert.ok(enemy.bossTime > 7.99 && enemy.bossTime <= 8);
  }
});
test('pre-duel damage can finish a Boss when troop losses lower its health budget', () => {
  const { game, enemy } = isolated('brute');
  game.troops = 100; enemy.kind = 'boss'; enemy.z = -BOSS_DUEL_RANGE; enemy.bossTime = -1;
  const original = game.bossHealthBudget;
  enemy.maxHp = original; enemy.hp = original * .5;
  enemy.attackTimer = 0;
  game.troops = 8; game.update(.001);
  assert.equal(enemy.hp, 0); assert.equal(enemy.active, false);
  assert.equal(game.bossesKilled, 1); assert.equal(game.status, 'playing');
  assert.equal(game.strikes.length, 0); assert.equal(game.threats.length, 0);
});
test('same-firepower Boss health has a reachable eight-second ceiling at extreme progression', () => {
  const game = new Engine(); game.troops = 1e6; game.gearLevel = 10; game.power = 3.5; game.weapon = 4;
  const opening = game.bossHealthBudget;
  game.bossesKilled = 10;
  assert.ok(Math.abs(game.bossHealthBudget / opening - 8 / 7) < .0001);
  game.bossesKilled = 10000;
  assert.equal(game.difficulty, 3);
  assert.ok(game.bossHealthBudget <= game.baseDps * 7.7 * 1.4);
  game.troops = 12; game.gearLevel = 0; game.power = 1; game.weapon = 0;
  assert.ok(game.bossHealthBudget < game.baseDps * 6 * 1.4);
});
test('positive gates grow under fire and a stronger weapon increases gate numbers faster', () => {
  const gains = [];
  for (const weapon of [0, 4]) {
    const { game, enemy } = isolated('raider');
    enemy.kind = 'gate'; enemy.operation = 'add'; enemy.value = 20; enemy.gateLimit = 50; enemy.z = -27;
    game.weapon = weapon; game.weaponXP = WEAPONS[weapon].unlock;
    advance(game, 1.5); gains.push(enemy.value - 20);
    assert.ok(enemy.value > 20);
  }
  assert.ok(gains[1] > gains[0]);
});
test('after beginner protection expires negative gates deduct their signed count and can end the run', () => {
  const game = new Engine(); game.bossesKilled = 10;
  const gate = game.entities[0]; gate.value = -50; gate.operation = 'add';
  game.troops = 80; game.applyGate(gate); assert.equal(game.troops, 30);
  const next = game.entities[1]; next.active = true; next.operation = 'add'; next.value = -50;
  game.applyGate(next); assert.equal(game.status, 'defeat'); assert.equal(game.troops, 0);
});
test('first-ten protection absorbs repeated hazards and gate mistakes, then expires and resets correctly', () => {
  const game = new Engine(); game.start(); game.entities = [];
  for (let i = 0; i < 30; i++) {
    game.threats.push({ id: 1000 + i, x: 0, z: -.3, vx: 0, speed: 20, damage: 999, radius: .32 });
    game.update(.25);
  }
  assert.equal(game.troops, 8); assert.equal(game.status, 'playing');
  const gate = new Engine().entities[0]; gate.value = -50; game.applyGate(gate);
  assert.equal(game.troops, 8); assert.equal(game.beginnerProtection, true);
  game.bossesKilled = 9; assert.equal(game.beginnerProtection, true);
  game.bossesKilled = 10; assert.equal(game.beginnerProtection, false);
  gate.active = true; game.applyGate(gate); assert.equal(game.status, 'defeat');
  game.reset(); assert.equal(game.beginnerProtection, true); assert.equal(game.difficulty, .7); assert.equal(game.troops, 12);
});
test('low difficulty preserves useful Boss damage in a side lane and gradually tightens aim assistance', () => {
  const a = isolated('brute', 1e9), b = isolated('brute', 1e9);
  for (const { game, enemy } of [a, b]) { enemy.kind = 'boss'; enemy.z = -18; enemy.bossTime = 8; enemy.attackTimer = 99; }
  b.game.x = b.game.targetX = 3;
  advance(a.game, 1.2); advance(b.game, 1.2);
  assert.ok(1e9 - b.enemy.hp > (1e9 - a.enemy.hp) * .5);
  const firstRadius = b.game.bossAimRadius, firstAssist = b.game.bossAssistDamage;
  b.game.bossesKilled = 10; assert.ok(b.game.bossAimRadius < firstRadius); assert.ok(b.game.bossAssistDamage < firstAssist);
  b.game.bossesKilled = 120; assert.equal(b.game.bossAimRadius, .82); assert.equal(b.game.bossAssistDamage, .1);
});
for (let seed = 1; seed <= 12; seed++) {
  for (const mode of ['center', 'left', 'right', 'slow_mistakes']) {
    test(`Top Shooter beginner map ${seed}, ${mode}: clears at least three Bosses with normal starting resources`, () => {
      const game = new Engine(() => {}, seededRandom(seed)); game.start();
      const novice = novicePlayer(seededRandom(seed + 100));
      if (mode !== 'slow_mistakes') game.move(mode === 'left' ? -3 : mode === 'right' ? 3 : 0);
      for (let i = 0; i < 180 * 60 && game.status === 'playing' && game.bossesKilled < 3; i++) {
        if (mode === 'slow_mistakes') novice(game);
        game.update(1 / 60);
      }
      assert.equal(game.bossesKilled, 3, `${mode}: ${game.defeatReason}, ${game.elapsed.toFixed(1)}s`);
      assert.equal(game.status, 'playing'); assert.ok(game.difficulty <= .730001);
    });
  }
}
test('leaderboard rejects corrupt records, deduplicates and sorts true scores', () => {
  const base = { name: '射手', distance: 100, kills: 3, combo: 3, seconds: 6, weapon: 0, at: 1 };
  const records = normalizeRecords([{ ...base, id: 'a', score: 100 }, { ...base, id: 'b', score: 300 },
    { ...base, id: 'b', score: 800 }, { ...base, id: 'c', score: -1 }, null, { id: 'missing' }]);
  assert.deepEqual(records.map(r => r.score), [300, 100]);
});
test('leaderboard keeps only the best ten completed records', () => {
  const base = { name: '射手', distance: 100, kills: 3, combo: 3, seconds: 6, weapon: 0, at: 1 };
  const records = normalizeRecords(Array.from({ length: 20 }, (_, i) => ({ ...base, id: `run-${i}`, score: (i + 1) * 100 })));
  assert.equal(records.length, 10); assert.equal(records[0].score, 2000); assert.equal(records[9].score, 1100);
  assert.equal(WEAPONS.length, 20);
});

test('twenty weapon tiers have unique effects, increasing damage and increasing same-army DPS', () => {
  assert.equal(new Set(WEAPONS.map(w => w.id)).size, 20);
  assert.equal(new Set(WEAPONS.map(w => w.name)).size, 20);
  assert.equal(new Set(WEAPONS.map(w => JSON.stringify(w.audio))).size, 20);
  const game = new Engine(); let previousDamage = 0, previousDps = 0;
  WEAPONS.forEach((w, i) => {
    game.weapon = i; game.weaponXP = w.unlock;
    assert.ok(w.damage > previousDamage); assert.ok(game.dps > previousDps, w.name);
    if (i) assert.ok(w.unlock > WEAPONS[i - 1].unlock);
    previousDamage = w.damage; previousDps = game.dps;
    assert.equal(game.mastery, 0);
  });
});
for (let tier = 1; tier < WEAPONS.length; tier++) {
  test(`Top Shooter Lv.${tier + 1} ${WEAPONS[tier].name} unlocks through earned combat experience`, () => {
    const { game, enemy } = isolated('raider', 1); const events: GameEvent[] = [];
    game.onEvent = e => events.push(e); game.weapon = tier - 1; game.weaponXP = WEAPONS[tier].unlock - 1;
    advance(game, .6);
    assert.equal(enemy.active, false); assert.equal(game.weapon, tier);
    assert.ok(events.some(e => e.type === 'upgrade' && e.weapon === tier));
  });
}
test('every tier applies its registered burn, slow, splash and chain mechanics on a real hit', () => {
  WEAPONS.forEach((w, tier) => {
    const { game, enemy } = isolated('raider', 1e8);
    const neighbor = { ...enemy, id: enemy.id + 1000, x: .4, homeX: .4, z: enemy.z - .3 };
    const events: GameEvent[] = []; game.onEvent = e => events.push(e);
    game.entities.push(neighbor); game.weapon = tier; game.weaponXP = w.unlock;
    game.bullets = [{ id: 9999, x: enemy.x, z: enemy.z, target: enemy.id, damage: 10, weapon: tier }];
    game.update(1 / 60);
    assert.ok(enemy.hp < enemy.maxHp, w.name);
    assert.equal(enemy.burn > 0, w.burn > 0, w.name);
    assert.equal(enemy.slow > 0, w.slow > 0, w.name);
    if (w.splash || w.chains) assert.ok(neighbor.hp < neighbor.maxHp, w.name);
    if (w.chains) assert.ok(events.some(e => e.type === 'chain' && e.weapon === tier));
  });
});
test('rank records accept all twenty tiers and reject invalid or fractional tiers', () => {
  const base = { name: 'Top Shooter', distance: 100, kills: 3, combo: 3, seconds: 6, at: 1, score: 100 };
  WEAPONS.forEach((_, weapon) => assert.equal(normalizeRecords([{ ...base, id: `tier-${weapon}`, weapon }]).length, 1));
  for (const weapon of [-1, 20, 4.5, Infinity]) assert.equal(normalizeRecords([{ ...base, id: 'bad', weapon }]).length, 0);
});
test('audio budgets reserve cue capacity, merge duplicate events and suppress shots during impacts', () => {
  const mix = new AudioMixGate();
  for (let i = 0; i < 200; i++) mix.reserve('shot', 0);
  assert.equal(mix.voices.shot, 4);
  for (let i = 0; i < 200; i++) { mix.reserve('music', 0); mix.reserve('cue', 0); }
  assert.equal(mix.total, 32); assert.equal(mix.voices.cue, 16);
  assert.equal(mix.event('bossImpact', 1, .16), true);
  assert.equal(mix.event('bossImpact', 1.1, .16), false);
  assert.equal(mix.event('bossImpact', 1.17, .16), true);
  for (let i = 0; i < 200; i++) for (const bus of ['music', 'cue', 'shot'] as const) mix.release(bus);
  assert.equal(mix.total, 0);
  mix.duck(2, .3); assert.equal(mix.reserve('shot', 2.1), false);
  assert.equal(mix.reserve('cue', 2.1), true); assert.equal(mix.reserve('shot', 2.31), true);
});
