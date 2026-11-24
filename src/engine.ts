import { BOSSES, BOSS_TYPES, type BossType, type AttackStyle } from './bosses.ts';
import { WEAPONS, FINAL_WEAPON_XP, MASTERY_XP_STEP } from './weapons.ts';
export { WEAPONS, FINAL_WEAPON, FINAL_WEAPON_XP, MASTERY_XP_STEP } from './weapons.ts';
export { BOSSES, BOSS_TYPES, BOSS_EFFECTS } from './bosses.ts';
export type { BossType, AttackStyle } from './bosses.ts';
export type Status = 'ready' | 'playing' | 'paused' | 'defeat';
export type Kind = 'gate' | 'enemy' | 'barrel' | 'boss';
export const GAME_PACE = 0.75;
export const OPENING_FACTOR = 0.7;
export const MAX_DIFFICULTY = 3;
export const ENEMY_PRESSURE = 1.2;
export const BEGINNER_BOSSES = 10;
export const BEGINNER_TROOPS = 8;
export const BOSS_PROGRESS_STEP = 0.01;
export const LATE_BOSS_PROGRESS_STEP = 0.02;
export const GATE_RECRUIT_LIMIT = 30;
export const GATE_MULTIPLY_STEP_SECONDS = 0.65;
export const GATE_FORGE_STEP_SECONDS = 2.6;
export const BOSS_AIM_RADIUS = 0.82;
export const ATTACK_RANGE = 70;
export const BOSS_DUEL_RANGE = 28;
export type EnemyType = 'raider' | 'guard' | 'runner' | 'mage' | BossType;
export function bossInfo(type: EnemyType) { return BOSSES[type as BossType] ?? BOSSES.brute; }
export const BOSS_DUEL_SECONDS = 8;
export interface Entity {
  id: number; kind: Kind; archetype: EnemyType;
  x: number; homeX: number; z: number;
  hp: number; maxHp: number; value: number;
  operation: 'add' | 'multiply' | 'subtract' | 'forge';
  active: boolean; hit: number; pair?: number;
  attackTimer: number; burn: number; burnDamage: number; slow: number;
  locked: boolean; bossTime: number; focus: number; executing: boolean;
  attackPhase: number; enraged: boolean; gateCharge: number; gateLimit: number;
}
export interface Bullet {
  id: number; x: number; z: number; target: number; damage: number; weapon: number; gateSeconds?: number;
}
export interface Threat {
  id: number; x: number; z: number; vx: number; speed: number; damage: number; radius: number;
  color?: string; source?: number; style?: AttackStyle; tracking?: number; effectId?: string;
}
export interface Strike {
  id: number; source: number; x: number; radius: number; timer: number; duration: number;
  color?: string; style?: AttackStyle; originX?: number; originZ?: number; effectId?: string; skillName?: string;
}
export function compact(value: number) {
  if (value >= 1e12) return value.toExponential(1);
  if (value >= 1e8) return `${(value / 1e8).toFixed(1)}亿`;
  if (value >= 1e4) return `${(value / 1e4).toFixed(1)}万`;
  return String(Math.ceil(Math.max(0, value)));
}
export interface GameEvent {
  type: 'state' | 'gate' | 'kill' | 'hurt' | 'shot' | 'hit' | 'upgrade' | 'fever' | 'warning' | 'chain' | 'bossAttack' | 'bossImpact';
  text?: string; x?: number; z?: number; value?: number; weapon?: number;
  toX?: number; toZ?: number; boss?: boolean; style?: AttackStyle; color?: string; radius?: number; source?: number; effectId?: string; skillName?: string;
}
export function gateProgress(entity: Entity) {
  if (entity.value >= entity.gateLimit && !entity.locked) return 1;
  const seconds = entity.locked ? 1 : entity.operation === 'multiply' ? GATE_MULTIPLY_STEP_SECONDS : GATE_FORGE_STEP_SECONDS;
  return Math.min(1, entity.gateCharge / seconds);
}

export class Engine {
  status: Status = 'ready';
  troops = 12;
  score = 0;
  kills = 0;
  distance = 0;
  elapsed = 0;
  x = 0;
  targetX = 0;
  power = 1;
  weapon = 0;
  weaponXP = 0;
  gearLevel = 0;
  bossesKilled = 0;
  peakDps = 0;
  defeatReason = '';
  combo = 0;
  maxCombo = 0;
  comboTimer = 0;
  rage = 0;
  fever = 0;
  entities: Entity[] = [];
  bullets: Bullet[] = [];
  threats: Threat[] = [];
  strikes: Strike[] = [];
  private uid = 0;
  private pair = 0;
  private generatedDistance = 0;
  private row = 0;
  private reinforcementCredit = 1 - (ENEMY_PRESSURE - 1);
  private shotTimer = 0;
  private nextBoss = 18;
  private bossIndex = 0;
  private entityIndex = new Map<number, Entity>();
  private hurtCooldown = 0;
  private distanceScore = 0;
  private random: () => number;
  onEvent: (event: GameEvent) => void;

  constructor(onEvent: (event: GameEvent) => void = () => {}, random = Math.random) {
    this.onEvent = onEvent;
    this.random = random;
    this.seedRun();
  }
  get difficulty() {
    const kills = Math.max(0, this.bossesKilled);
    return Math.min(MAX_DIFFICULTY, OPENING_FACTOR + Math.min(kills, BEGINNER_BOSSES) * BOSS_PROGRESS_STEP +
      Math.max(0, kills - BEGINNER_BOSSES) * LATE_BOSS_PROGRESS_STEP);
  }
  get progression() { return this.difficulty / OPENING_FACTOR; }
  get beginnerProtection() { return this.bossesKilled < BEGINNER_BOSSES; }
  private get protectedTroops() { return this.beginnerProtection ? Math.min(this.troops, BEGINNER_TROOPS) : 0; }
  private get aimAssistance() {
    return .8 * (MAX_DIFFICULTY - this.difficulty) / (MAX_DIFFICULTY - OPENING_FACTOR);
  }
  get bossAimRadius() { return BOSS_AIM_RADIUS + this.aimAssistance * 1.8; }
  get bossAssistDamage() { return .1 + this.aimAssistance * .8; }
  get encounterPace() { return GAME_PACE * this.difficulty; }
  get speed() { return 17 * GAME_PACE * Math.min(MAX_DIFFICULTY, this.difficulty * (this.fever > 0 ? 1.14 : 1)); }
  get multiplier() { return (1 + Math.min(4, Math.floor(this.combo / 5))) * (this.fever > 0 ? 2 : 1); }
  get weaponInfo() { return WEAPONS[this.weapon]; }
  get mastery() { return Math.max(0, Math.floor((this.weaponXP - FINAL_WEAPON_XP) / MASTERY_XP_STEP)); }
  get volleyDamage() {
    return (4 + this.troops * 0.3) * this.power * (1 + this.mastery * 0.12) * this.weaponInfo.damage * (this.fever > 0 ? 1.6 : 1);
  }
  get fireInterval() { return this.weaponInfo.interval / GAME_PACE * (this.fever > 0 ? 0.58 : 1); }
  get dps() { return this.volleyDamage / this.fireInterval; }
  get baseDps() { return this.dps / (this.fever > 0 ? 1.6 / 0.58 : 1); }
  get bossApproachSpeed() { return 10 * this.encounterPace; }
  get bossHealthBudget() {
    // Freeze health on arrival; upgrades earned during combat remain a real advantage.
    // Account for the current frenzy expiring, projectile flight, tracking and dodges.
    // Reserve two seconds for projectile flight, acquiring focus and deliberate dodges.
    const window = BOSS_DUEL_SECONDS - 2;
    const frenzySeconds = Math.min(window, this.fever);
    const damageWindow = window - frenzySeconds + frenzySeconds * (1.6 / 0.58);
    // An eight-second duel must remain inside achievable focused firepower.
    // Difficulty continues to grow through movement and attack frequency after this limit.
    const pressure = Math.min(0.98, 0.87 * this.difficulty);
    const availableDamage = this.baseDps * damageWindow * 1.4;
    // Keep even a small starting army inside its achievable damage budget.
    return Math.max(1, Math.round(availableDamage * pressure));
  }
  get boss() { return this.entities.find(e => e.active && e.kind === 'boss' && e.z > -56 && e.z < 2); }

  start() {
    if (this.status !== 'ready') return;
    this.status = 'playing';
    this.onEvent({ type: 'state' });
  }
  reset() {
    this.troops = 12; this.score = this.kills = this.distance = this.elapsed = 0;
    this.x = this.targetX = 0; this.power = 1; this.weapon = this.weaponXP = 0;
    this.gearLevel = this.bossesKilled = this.peakDps = 0; this.defeatReason = '';
    this.combo = this.maxCombo = this.comboTimer = this.rage = this.fever = 0;
    this.generatedDistance = this.row = this.shotTimer = this.hurtCooldown = this.distanceScore = 0;
    this.reinforcementCredit = 1 - (ENEMY_PRESSURE - 1);
    this.nextBoss = 18; this.bossIndex = 0; this.pair = 0; this.entityIndex.clear();
    this.entities = []; this.bullets = []; this.threats = []; this.strikes = [];
    this.seedRun();
    this.status = 'ready';
    this.onEvent({ type: 'state' });
  }
  pause() {
    if (this.status !== 'playing' && this.status !== 'paused') return;
    this.status = this.status === 'playing' ? 'paused' : 'playing';
    this.onEvent({ type: 'state' });
  }
  move(x: number) { this.targetX = Math.max(-3, Math.min(3, x)); }

  private add(kind: Kind, x: number, worldDistance: number, value: number, operation: Entity['operation'] = 'add', pair?: number, archetype: EnemyType = 'raider') {
    const entity: Entity = {
      id: ++this.uid, kind, archetype, x, homeX: x, z: this.distance - worldDistance,
      hp: value, maxHp: value, value, operation, pair, active: true, hit: 0,
      attackTimer: (1.25 + this.random()) / ENEMY_PRESSURE, burn: 0, burnDamage: 0, slow: 0,
      locked: false, bossTime: -1, focus: 0, executing: false, attackPhase: 0, enraged: false, gateCharge: 0,
      gateLimit: operation === 'multiply' ? value + .5 : operation === 'forge' ? value + 2 : Math.max(0, value) + GATE_RECRUIT_LIMIT,
    };
    this.entities.push(entity);
    return entity;
  }
  private spawnEnemy(x: number, at: number, hp: number, archetype: EnemyType = 'raider') {
    this.add('enemy', x, at, hp, 'add', undefined, archetype);
    // One extra squad per five ordinary squads, including the very first wave.
    this.reinforcementCredit += ENEMY_PRESSURE - 1;
    if (this.reinforcementCredit >= 1 - 1e-9) {
      this.reinforcementCredit = Math.max(0, this.reinforcementCredit - 1);
      this.add('enemy', x === 0 ? 2.2 : -x, at + 3, hp, 'add', undefined, archetype);
    }
  }
  private gates(at: number, safe = false) {
    const pair = ++this.pair;
    const left = safe || this.random() > 0.5;
    const recruit = Math.round(10 + Math.min(30, this.bossesKilled * .5));
    const special = safe || pair % 4 === 0 ? 'multiply' : pair % 4 === 2 ? 'forge' : 'add';
    this.add('gate', left ? -2.15 : 2.15, at, recruit, 'add', pair);
    const gate = this.add('gate', left ? 2.15 : -2.15, at,
      special === 'multiply' ? 2 : special === 'forge' ? 1 : -Math.round(35 + Math.min(35, this.bossesKilled)), special, pair);
    if (!safe && special === 'multiply') {
      gate.locked = true; gate.hp = gate.maxHp = 1;
    }
  }
  private seedRun() {
    this.gates(14, true);
    this.spawnEnemy(-1.6, 30, 30 * this.difficulty);
    this.spawnEnemy(1.5, 37, 30 * this.difficulty, 'runner');
    this.add('barrel', 0, 47, 22);
    this.generatedDistance = 54;
    this.fillAhead();
  }
  private fillAhead() {
    while (this.generatedDistance < this.distance + 115) {
      const at = this.generatedDistance;
      const lane = (Math.floor(this.random() * 3) - 1) * 2.1;
      const hp = Math.max(32, this.baseDps * .42) * this.difficulty;
      if (this.row % 5 === 3) this.gates(at);
      else if (this.row % 7 === 4) this.add('barrel', lane, at, Math.max(25, this.baseDps * .28) * this.difficulty);
      else {
        const types: EnemyType[] = this.bossesKilled > 0 ? ['raider', 'guard', 'runner', 'mage'] : ['raider', 'runner', 'guard'];
        const type = types[Math.floor(this.random() * types.length)];
        this.spawnEnemy(lane, at, Math.round(hp * (type === 'guard' ? 1.7 : type === 'mage' ? 1.2 : 1)), type);
        if (this.row % 3 === 0) this.spawnEnemy(lane === 0 ? 2.2 : -lane, at + 3, Math.round(hp * 0.8));
        if (this.bossesKilled >= 3 && this.row % 4 === 0) this.spawnEnemy(lane === 0 ? -2.2 : 0, at + 6, Math.round(hp), 'runner');
      }
      this.generatedDistance += 13 + this.random() * 4;
      this.row++;
    }
  }
  applyGate(entity: Entity) {
    if (!entity.active) return;
    if (entity.locked) {
      this.onEvent({ type: 'warning', text: '倍增门未解锁 · 先瞄准击破护盾' });
      for (const e of this.entities) if (e.kind === 'gate' && e.pair === entity.pair) e.active = false;
      return;
    }
    const old = this.troops, protectedTroops = this.protectedTroops;
    if (entity.operation === 'forge') {
      this.troops -= Math.ceil(this.troops * 0.08);
      this.upgradeGear(Math.floor(entity.value));
    } else this.troops = entity.operation === 'multiply' ? Math.floor(this.troops * entity.value)
      : this.troops + (entity.operation === 'subtract' ? -entity.value : entity.value);
    this.troops = Math.max(protectedTroops, this.troops);
    this.onEvent({
      type: entity.operation === 'forge' || this.troops >= old ? 'gate' : 'hurt', x: entity.x, z: 0,
      text: entity.operation === 'forge' ? `锻造 +${entity.value} · −${compact(old - this.troops)} 勇士`
        : entity.operation === 'multiply' ? `军团 ×${entity.value}` : `${this.troops >= old ? '+' : '−'}${compact(Math.abs(this.troops - old))} 勇士`,
      value: this.troops - old,
    });
    for (const e of this.entities) if (e.kind === 'gate' && e.pair === entity.pair) e.active = false;
    if (this.troops < old && entity.operation !== 'forge') this.breakCombo();
    if (this.troops <= 0) this.defeat();
  }
  private breakCombo() { this.combo = 0; this.comboTimer = 0; }
  private upgradeGear(levels = 1) { this.gearLevel += levels; this.power = 1 + this.gearLevel * 0.25; }
  private hurt(damage: number, fraction = 0, heavy = false) {
    if (this.hurtCooldown > 0 && !heavy) return;
    const loss = Math.min(this.troops - this.protectedTroops,
      Math.max(1, Math.ceil(Math.max(damage, this.troops * fraction) * (this.fever > 0 && !heavy ? 0.6 : 1) - 1e-9)));
    if (loss <= 0) return;
    this.troops -= loss;
    this.hurtCooldown = 0.32;
    this.breakCombo();
    this.onEvent({ type: 'hurt', text: `−${compact(loss)} 勇士`, x: this.x, z: 0, value: -loss });
    if (this.troops <= 0) this.defeat();
  }
  private defeat(reason = '军团全灭 · 招募、锻造并躲避预警攻击') {
    this.defeatReason = reason;
    this.status = 'defeat';
    this.bullets = []; this.threats = []; this.strikes = [];
    this.onEvent({ type: 'state' });
  }
  private kill(e: Entity) {
    if (!e.active) return;
    const previousMastery = this.mastery;
    e.active = false; this.kills++; this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboTimer = 4.5;
    this.weaponXP += e.kind === 'barrel' ? 3 : e.kind === 'boss' ? 4 : 1;
    const points = (e.kind === 'boss' ? 800 : e.kind === 'barrel' ? 80 : e.archetype === 'guard' ? 100 : e.archetype === 'mage' ? 120 : 60) * this.multiplier;
    this.score += points;
    this.rage = Math.min(1, this.rage + (e.kind === 'boss' ? 0.3 : 0.085));
    if (e.kind === 'barrel') {
      this.upgradeGear(); this.troops += Math.round(6 + Math.min(20, this.bossesKilled * .4));
    }
    if (e.kind === 'boss') {
      this.bossesKilled++;
      this.troops += Math.round(15 + Math.min(60, this.bossesKilled));
      this.upgradeGear();
      this.strikes = this.strikes.filter(s => s.source !== e.id);
      // Summons remain in play, but the defeated Boss's projectiles dissolve.
      this.threats = this.threats.filter(t => t.source !== e.id);
    }
    this.onEvent({ type: 'kill', x: e.x, z: e.z, value: points, weapon: this.weapon, boss: e.kind === 'boss',
      text: e.kind === 'barrel' ? '补给击破 · 装备 +1 / 招募' : e.kind === 'boss' ? `巨兽击破 · 装备 +1 / +${points}` : `+${points}` });
    let next = 0;
    WEAPONS.forEach((w, i) => { if (this.weaponXP >= w.unlock) next = i; });
    if (next > this.weapon) {
      this.weapon = next;
      this.onEvent({ type: 'upgrade', text: `${this.weaponInfo.name} · 已进化`, weapon: this.weapon });
    }
    // Mastery starts only after all twenty distinct weapon tiers have unlocked.
    if (this.mastery > previousMastery) {
      this.onEvent({ type: 'upgrade', text: `奇点精通 +${this.mastery} · 伤害持续提升`, weapon: this.weapon });
    }
    if (this.rage >= 1 && this.fever <= 0) {
      this.fever = 6; this.rage = 0;
      this.onEvent({ type: 'fever', text: '狂热爆发 · 双倍得分！', x: this.x, z: 0, weapon: this.weapon });
    }
  }
  private damage(e: Entity, amount: number, weapon: number, gateSeconds?: number) {
    if (!e.active) return;
    if (e.kind === 'gate') {
      // Effective seconds of aimed fire, normalized across army size, projectile count and frenzy.
      // Better equipment helps modestly; millions of troops cannot skip the investment.
      const efficiency = 1 + Math.min(.35, weapon * .06 + Math.log2(1 + this.gearLevel) * .02 +
        Math.log2(1 + this.troops / 12) * .02);
      const effort = (gateSeconds ?? Math.max(0, amount) / Math.max(1, this.volleyDamage) * this.fireInterval) * efficiency;
      if (e.operation === 'add' || e.operation === 'subtract') {
        const signed = e.operation === 'subtract' ? -e.value : e.value;
        // Recovery from a penalty is faster than farming an already positive reward.
        e.gateCharge += effort * (signed < 0 ? 32 : 18);
        const gain = Math.min(Math.floor(e.gateCharge + 1e-9), Math.max(0, e.gateLimit - signed));
        if (gain > 0) {
          const previous = e.operation === 'subtract' ? -e.value : e.value;
          e.value = previous + gain; e.operation = 'add'; e.gateCharge -= gain;
          if (previous < 0 && e.value >= 0) this.onEvent({ type: 'gate', x: e.x, z: e.z, value: 0 });
        }
        if (e.value >= e.gateLimit) e.gateCharge = 0;
        e.hit = 1;
        this.onEvent({ type: 'hit', x: e.x, z: e.z, weapon });
        return;
      } else {
        e.gateCharge += effort;
        if (e.locked) {
          e.hp = Math.max(0, 1 - e.gateCharge);
          if (e.hp > 0) { e.hit = 1; return; }
          e.locked = false; e.gateCharge = Math.max(0, e.gateCharge - 1);
          this.onEvent({ type: 'upgrade', text: '倍增护盾击破', x: e.x, z: e.z });
        }
        const seconds = e.operation === 'multiply' ? GATE_MULTIPLY_STEP_SECONDS : GATE_FORGE_STEP_SECONDS;
        const step = e.operation === 'multiply' ? .1 : 1;
        while (e.gateCharge + 1e-9 >= seconds && e.value < e.gateLimit) {
          e.value = Math.min(e.gateLimit, Math.round((e.value + step) * 10) / 10);
          e.gateCharge -= seconds;
        }
        if (e.value >= e.gateLimit) e.gateCharge = 0;
      }
      e.hit = 1;
      this.onEvent({ type: 'hit', x: e.x, z: e.z, weapon });
      return;
    }
    e.hp -= amount * (e.archetype === 'guard' && weapon < 2 ? 0.7 : 1);
    e.hp = Math.max(0, e.hp);
    e.hit = 1;
    const definition = WEAPONS[weapon];
    if (definition.slow) e.slow = Math.max(e.slow, definition.slow);
    if (definition.burn) { e.burn = Math.max(e.burn, definition.burn); e.burnDamage = Math.max(e.burnDamage, amount * .65); }
    this.onEvent({ type: 'hit', x: e.x, z: e.z, weapon });
    if (e.hp <= 0) this.kill(e);
  }
  private impact(b: Bullet, e: Entity) {
    this.damage(e, b.damage, b.weapon, b.gateSeconds);
    const definition = WEAPONS[b.weapon];
    if (definition.splash) {
      const radius = definition.splash;
      for (const t of this.entities) if (t.active && t.id !== e.id && t.kind !== 'gate' &&
        (t.x - e.x) ** 2 + (t.z - e.z) ** 2 < radius * radius) this.damage(t, b.damage * 0.65, b.weapon);
    }
    if (definition.chains) {
      const visited = new Set([e.id]);
      let from = e;
      for (let i = 0; i < definition.chains; i++) {
        let next: Entity | undefined, nearest = 64;
        for (const t of this.entities) {
          if (!t.active || t.kind === 'gate' || visited.has(t.id)) continue;
          const distance = (t.x - from.x) ** 2 + (t.z - from.z) ** 2;
          if (distance < nearest) { next = t; nearest = distance; }
        }
        if (!next) break;
        visited.add(next.id);
        this.onEvent({ type: 'chain', x: from.x, z: from.z, toX: next.x, toZ: next.z, weapon: b.weapon });
        this.damage(next, b.damage * 0.7, b.weapon); from = next;
      }
    }
  }
  private bossAttack(e: Entity) {
    const info = bossInfo(e.archetype);
    const phase = e.attackPhase++;
    const skill = info.skills[phase % 2];
    const warning = (e.enraged ? 0.74 : 0.92) / Math.sqrt(this.difficulty);
    const style = skill.effect.style;
    const strike = (x: number, radius = skill.radius, duration = warning + skill.delay) => {
      if (this.strikes.length >= 16) return;
      x = Math.max(-2.6, Math.min(2.6, x));
      this.strikes.push({ id: ++this.uid, source: e.id, x, radius, timer: duration, duration,
        color: skill.color, style, originX: e.x, originZ: e.z, effectId: skill.effect.id, skillName: skill.name });
      this.onEvent({ type: 'bossAttack', x: e.x, z: e.z, toX: x, toZ: 0,
        value: duration, radius, style, color: skill.color, boss: true, source: e.id, effectId: skill.effect.id, skillName: skill.name });
    };
    const fan = (count: number, spread: number, speed = 20, aimed = false) => {
      const aim = aimed ? (this.x - e.x) / Math.max(0.3, -e.z / speed) : 0;
      for (let i = 0; i < count; i++) this.threats.push({
        id: ++this.uid, source: e.id, x: e.x, z: e.z + 1,
        speed: speed * this.encounterPace * ENEMY_PRESSURE,
        vx: (aim + (i - (count - 1) / 2) * spread) * this.encounterPace * ENEMY_PRESSURE,
        damage: 4 * this.difficulty, radius: 0.3, color: skill.color, style, effectId: skill.effect.id,
        tracking: info.body === 'void' ? .55 : undefined,
      });
    };
    const side = phase % 4 < 2 ? -1 : 1;
    switch (skill.pattern) {
      case 'lock': strike(this.x); break;
      case 'split': strike(side * 2.3); strike(0, skill.radius * .85, warning + .38); break;
      case 'cross': strike(this.x); strike(-side * 2.3, skill.radius, warning + .34); break;
      case 'stagger': strike(side * 2.2); strike(0, skill.radius * .85, warning + .42); break;
      case 'pincer': strike(-2.35); strike(2.35); break;
      case 'sweep': strike(this.x); strike(side * 2.5, .72, warning + .44); break;
      case 'orbit': strike(side * 2.3); strike(-side * 2.3, skill.radius * .82, warning + .28); break;
      case 'comet': strike(this.x, skill.radius, warning + .18); break;
      case 'rift': strike(this.x); strike(side * 2.35, .72, warning + .45); break;
      case 'summon': strike(this.x, skill.radius, warning + .2); break;
    }
    fan(skill.bullets, skill.spread, skill.speed, ['cross', 'sweep', 'comet', 'rift'].includes(skill.pattern));
    if (info.body === 'necromancer') {
        const summons = this.entities.filter(t => t.active && t.kind === 'enemy').length;
        if (summons < 18) {
          for (const side of [-1, 1]) {
            this.spawnEnemy(side * 2.3, this.distance - e.z - 2,
              Math.round(Math.max(32, this.baseDps * .3) * this.difficulty), phase % 2 ? 'mage' : 'runner');
          }
        }
    }
    e.attackTimer = info.interval * (e.enraged ? .72 : .87) / (this.difficulty * ENEMY_PRESSURE);
  }
  private advanceBoss(e: Entity, dt: number) {
    let remaining = dt;
    if (e.z < -BOSS_DUEL_RANGE && e.bossTime < 0) {
      const approach = Math.min(-BOSS_DUEL_RANGE - e.z, this.bossApproachSpeed * remaining);
      e.z += approach;
      remaining -= approach / this.bossApproachSpeed;
    }
    if (e.z < -BOSS_DUEL_RANGE) return;
    if (e.bossTime < 0) {
      // Lost troops before contact lower the budget; earned upgrades remain an advantage.
      const damageTaken = e.maxHp - e.hp;
      e.maxHp = Math.min(e.maxHp, this.bossHealthBudget);
      e.hp = Math.max(0, e.maxHp - damageTaken);
      e.bossTime = BOSS_DUEL_SECONDS;
      if (e.hp <= 0) { this.kill(e); return; }
    }
    const fighting = Math.min(remaining, Math.max(0, e.bossTime - 1));
    // Keep an approaching Boss in front of the fixed army even in very long runs.
    const duelPace = Math.min(this.encounterPace, .9);
    e.z += fighting * 3 * duelPace;
    e.bossTime -= fighting;
    remaining -= fighting;
    const execution = Math.min(remaining, e.bossTime);
    e.z += execution * 6 * duelPace;
    e.bossTime = Math.max(0, e.bossTime - execution);
    if (e.bossTime < 1e-9) e.bossTime = 0;
    // Position advances monotonically, independently of enemy speed and frenzy.
    const fightTime = (BOSS_DUEL_SECONDS - e.bossTime) * Math.min(this.encounterPace, 1.5);
    const info = bossInfo(e.archetype);
    e.x = Math.sin(fightTime * (.75 + info.variant * .12)) * info.motion;
    if (e.hp <= e.maxHp * .45 && !e.enraged) {
      e.enraged = true;
      this.onEvent({ type: 'warning', text: `${bossInfo(e.archetype).name} 狂暴 · 预警加快！`, boss: true });
    }
    const aligned = Math.abs(this.x - e.x) <= this.bossAimRadius;
    e.focus = Math.max(0, Math.min(1, e.focus + (aligned ? dt / .85 : -dt * 5)));
    if (e.bossTime <= 1 && !e.executing) {
      e.executing = true;
      this.onEvent({ type: 'warning', text: '最后 1 秒！血量未归零将被斩杀', boss: true });
    }
  }
  update(delta: number) {
    if (this.status !== 'playing') return;
    // Substeps retain real elapsed time at low FPS without skipping collisions.
    let remaining = Math.min(Math.max(0, delta), 0.25);
    while (remaining > 0 && this.status === 'playing') {
      const dt = Math.min(remaining, 1 / 60);
      this.step(dt); remaining -= dt;
    }
  }
  private step(dt: number) {
    this.elapsed += dt;
    this.fever = Math.max(0, this.fever - dt);
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0) this.combo = 0;
    this.x += (this.targetX - this.x) * Math.min(1, dt * 20 * GAME_PACE);
    const travel = this.speed * dt;
    this.distance += travel; this.distanceScore += travel;
    const meters = Math.floor(this.distanceScore);
    this.score += meters * 2; this.distanceScore -= meters;
    this.fillAhead();
    this.peakDps = Math.max(this.peakDps, this.baseDps);
    if (this.elapsed >= this.nextBoss && !this.entities.some(e => e.active && e.kind === 'boss')) {
      const type = BOSS_TYPES[this.bossIndex++ % BOSS_TYPES.length];
      const boss = this.add('boss', 0, this.distance + 45, this.bossHealthBudget, 'add', undefined, type);
      boss.attackTimer = .9 / ENEMY_PRESSURE;
      this.nextBoss = this.elapsed + 18;
      this.onEvent({ type: 'warning', text: `${bossInfo(type).name} 来袭 · 对准弱点，8 秒内击杀！`, boss: true });
    }
    for (const e of this.entities) {
      if (!e.active) continue;
      e.hit = Math.max(0, e.hit - dt * 7); e.slow = Math.max(0, e.slow - dt);
      if (e.kind === 'boss') this.advanceBoss(e, dt);
      else e.z += travel + (e.archetype === 'runner' && e.kind === 'enemy' ? dt * 5 * this.encounterPace * (e.slow > 0 ? 0.35 : 1) : 0);
      if (!e.active) continue;
      if (e.archetype === 'runner') e.x = Math.max(-3, Math.min(3, e.homeX + Math.sin(this.elapsed * 2.5 * this.encounterPace + e.id) * 0.75));
      if (e.burn > 0) {
        e.burn -= dt; e.hp = Math.max(0, e.hp - e.burnDamage * dt);
        if (e.hp <= 0) { this.kill(e); continue; }
      }
      if ((e.archetype === 'mage' || e.kind === 'boss') && e.z > -42 && e.z < -6 &&
        !e.executing && (e.kind !== 'boss' || e.bossTime >= 0)) {
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          if (e.kind === 'boss') {
            this.bossAttack(e);
          } else {
            for (let i = 0; i < 3; i++) this.threats.push({
               id: ++this.uid, x: e.x, z: e.z, vx: (i - 1) * 2.6 * this.encounterPace * ENEMY_PRESSURE,
               speed: 20 * this.encounterPace * ENEMY_PRESSURE, damage: 3 * this.difficulty, radius: 0.32,
            });
            e.attackTimer = 2.1 / (GAME_PACE * this.difficulty * ENEMY_PRESSURE);
          }
        }
      }
      if (e.kind === 'gate') {
        if (e.z >= -0.1 && e.z < 2 && Math.abs(this.x - e.x) <= 1.65) {
          this.applyGate(e);
          if (this.status !== 'playing') return;
        } else if (e.z > 2) e.active = false;
      } else if (e.kind !== 'boss' && e.z > -0.3 && e.z < 2) {
        const width = e.kind === 'barrel' ? 0.7 : 1.05;
        if (Math.abs(this.x - e.x) < width) {
           if (e.kind !== 'barrel') this.hurt(Math.min(e.hp / 10, this.troops * .35),
             Math.min(.5, (e.archetype === 'guard' ? 0.22 : 0.15) * this.difficulty));
          e.active = false;
          if (this.status !== 'playing') return;
        }
      } else if (e.kind !== 'boss' && e.z > 4) e.active = false;
    }
    this.shotTimer -= dt;
    if (this.shotTimer <= 0) {
      this.shotTimer += this.fireInterval;
      const targets = this.entities.filter(e => e.active && (e.kind !== 'gate' || e.locked || e.value < e.gateLimit) && e.z >= -ATTACK_RANGE && e.z < -0.6 &&
        Math.abs(this.x - e.x) < (e.kind === 'boss' ? 7 : e.kind === 'gate' ? 1.05 : e.kind === 'barrel' ? 1.4 : 2.4))
        .sort((a, b) => {
          // A near gate is a deliberate investment. A distant gate cannot steal a Boss duel.
          const priority = (e: Entity) => e.kind === 'gate' ? e.z > -12 ? 2 : .5 : e.kind === 'boss' ? 1 : 0;
          return priority(b) - priority(a) || b.z - a.z;
        });
      {
        const n = Math.min(this.weaponInfo.volley, Math.max(3, Math.ceil(this.troops / 5)));
        for (let i = 0; i < n; i++) {
          const target = targets.length ? targets[targets[0].kind === 'enemy' ? i % Math.min(targets.length, this.weaponInfo.targets) : 0] : undefined;
          // Easy difficulty keeps auto-tracked bullets useful even when a new player stays in a side lane.
          const bossBonus = target?.kind === 'boss'
            ? Math.abs(this.x - target.x) <= this.bossAimRadius ? Math.max(this.bossAssistDamage, .6 + target.focus * .8) : this.bossAssistDamage
            : 1;
          this.bullets.push({
            id: ++this.uid, x: this.x + (i - (n - 1) / 2) * 0.19,
            z: -0.4 - (i % 2) * 0.24, target: target?.id ?? 0, weapon: this.weapon,
            damage: this.volleyDamage * bossBonus / n,
             gateSeconds: this.fireInterval / n,
          });
        }
        this.onEvent({ type: 'shot', weapon: this.weapon, x: this.x, z: 0 });
      }
    }
    this.entityIndex.clear();
    for (const e of this.entities) this.entityIndex.set(e.id, e);
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; const e = this.entityIndex.get(b.target);
      if (b.target === 0) {
        b.z -= WEAPONS[b.weapon].speed * GAME_PACE * dt;
        if (b.z < -ATTACK_RANGE) this.bullets.splice(i, 1);
        continue;
      }
      if (!e?.active) { this.bullets.splice(i, 1); continue; }
      b.z -= WEAPONS[b.weapon].speed * GAME_PACE * dt;
      b.x += (e.x - b.x) * Math.min(1, dt * WEAPONS[b.weapon].tracking);
      if (b.z <= e.z + 0.6) { this.impact(b, e); this.bullets.splice(i, 1); }
    }
    for (let i = this.threats.length - 1; i >= 0; i--) {
      const t = this.threats[i];
      if (t.tracking && t.tracking > 0) {
        t.tracking = Math.max(0, t.tracking - dt);
        const aim = (this.x - t.x) / Math.max(.3, -t.z / t.speed);
        t.vx += (aim - t.vx) * Math.min(1, dt * 5);
      }
      t.z += t.speed * dt; t.x += t.vx * dt;
      if (t.z >= -0.35 && t.z < 1.5 && Math.abs(t.x - this.x) < 0.6 + t.radius) {
        this.hurt(t.damage, Math.min(.5, (t.source ? .13 : .1) * this.difficulty)); this.threats.splice(i, 1);
        if (this.status !== 'playing') return;
      } else if (t.z > 3 || Math.abs(t.x) > 9) this.threats.splice(i, 1);
    }
    for (const strike of this.strikes) {
      strike.timer -= dt;
      if (strike.timer <= 0) {
        this.onEvent({ type: 'bossImpact', x: strike.x, z: 0, toX: strike.originX, toZ: strike.originZ,
          color: strike.color, style: strike.style, radius: strike.radius, boss: true,
          effectId: strike.effectId, skillName: strike.skillName, source: strike.source });
        if (Math.abs(this.x - strike.x) <= strike.radius) this.hurt(5 * this.difficulty, Math.min(.6, .3 * this.difficulty), true);
        if (this.status !== 'playing') return;
      }
    }
    this.strikes = this.strikes.filter(s => s.timer > 0 && this.entityIndex.get(s.source)?.active);
    // Resolve this tick's projectiles and burns before the unavoidable execution.
    // Side lanes, frenzy and the normal damage cooldown cannot bypass a surviving Boss.
    const execution = this.entities.find(e => e.active && e.kind === 'boss' && e.bossTime === 0);
    if (execution) {
      const hp = compact(execution.hp);
      this.troops = 0;
      this.onEvent({ type: 'bossImpact', x: this.x, z: 0, toX: execution.x, toZ: execution.z,
        color: bossInfo(execution.archetype).color, style: 'blade', radius: 2.5, boss: true });
      this.onEvent({ type: 'hurt', text: '暴君斩杀', x: this.x, z: 0, boss: true });
      this.defeat(`Boss 剩余 ${hp} 生命 · 限时未击杀，遭到斩杀`);
      return;
    }
    // Removed rows never accumulate during long runs.
    this.entities = this.entities.filter(e => e.active);
    if (this.bullets.length > 180) this.bullets.splice(0, this.bullets.length - 180);
    if (this.threats.length > 160) this.threats.splice(0, this.threats.length - 160);
  }
}
