import { Engine } from '../src/engine.ts';

export function seededRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

// Slow, imprecise decisions, sometimes picking the penalty gate; no hazard dodging.
export function novicePlayer(random: () => number) {
  let nextAction = 0;
  return (game: Engine) => {
    if (game.elapsed < nextAction) return;
    nextAction = game.elapsed + .8 + random() * .8;
    const boss = game.boss;
    if (boss && boss.z > -28) { game.move(boss.x + (random() - .5) * 3.6); return; }
    const gates = game.entities.filter(e => e.kind === 'gate' && e.z > -16 && e.z < -1).sort((a, b) => b.z - a.z);
    if (gates.length) {
      const choices = gates.filter(g => g.pair === gates[0].pair);
      const safe = choices.find(g => g.value > 0 && !g.locked) ?? choices[0];
      game.move(random() < .35 ? choices[Math.floor(random() * choices.length)].x : safe.x);
    } else game.move((random() - .5) * 5.8);
  };
}

// A deterministic move-only player: no state writes, invulnerability or extra resources.
export function steer(game: Engine, upgrade = true, dodge = true) {
  const boss = game.boss;
  let x = boss && boss.z > -30 ? boss.x : 0;
  const gates = game.entities.filter(e => e.kind === 'gate' && e.z > -22 && e.z < 0);
  if (gates.length && (!boss || boss.z < -28)) {
    const pair = gates.sort((a, b) => b.z - a.z)[0].pair;
    const choices = gates.filter(g => g.pair === pair);
    const benefit = (g: typeof choices[number]) => {
      if (!upgrade && g.operation !== 'add') return -1;
      if (g.operation === 'multiply') return g.locked && g.z > -9 ? -1 : game.troops * g.value;
      if (g.operation === 'forge') return (game.troops - Math.ceil(game.troops * .08)) * (game.power + .25 * g.value) / game.power;
      return game.troops + g.value;
    };
    x = choices.sort((a, b) => benefit(b) - benefit(a))[0].x;
  } else if (!boss || boss.z < -28) {
    const targets = game.entities.filter(e => e.kind !== 'gate' && e.kind !== 'boss' && e.z > -27 && e.z < -2);
    targets.sort((a, b) => (upgrade ? Number(b.kind === 'barrel') - Number(a.kind === 'barrel') : 0) || b.z - a.z);
    x = targets[0]?.x ?? x;
  }
  if (dodge) {
    const zones = [
      ...game.strikes.filter(s => s.timer < .55),
      ...game.threats.filter(t => t.z > -7 && t.z < 1)
        .map(t => ({ x: t.x + t.vx * Math.max(0, -t.z / t.speed), radius: .95 })),
      ...game.entities.filter(e => e.kind === 'enemy' && e.z > -2 && e.hp > 10).map(e => ({ x: e.x, radius: 1.1 })),
    ];
    const safe = (v: number) => zones.every(z => Math.abs(v - z.x) > z.radius + .12);
    if (!safe(x)) {
      const candidates = Array.from({ length: 61 }, (_, i) => i / 10 - 3).filter(safe);
      candidates.sort((a, b) => Math.abs(a - x) - Math.abs(b - x));
      x = candidates[0] ?? (game.x < 0 ? 3 : -3);
    }
  }
  game.move(x);
}
