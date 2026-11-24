export const BOSS_BODIES = ['brute', 'storm', 'dragon', 'scorpion', 'hydra', 'necromancer', 'golem', 'reaper', 'void', 'leviathan',
  'spider', 'centaur', 'manta', 'phoenix', 'sentinel', 'seraph', 'serpent', 'crab', 'titan', 'beetle'] as const;
export type BossBody = typeof BOSS_BODIES[number];
export type AttackStyle = 'slam' | 'lightning' | 'flame' | 'venom' | 'ice' | 'rune' | 'eruption' | 'blade' | 'void' | 'tide';
export type AttackPattern = 'lock' | 'split' | 'cross' | 'stagger' | 'pincer' | 'sweep' | 'orbit' | 'comet' | 'rift' | 'summon';
const styles: AttackStyle[] = ['slam', 'lightning', 'flame', 'venom', 'ice', 'rune', 'eruption', 'blade', 'void', 'tide'];
export interface EffectRecipe {
  id: string; style: AttackStyle; variation: number; spokes: number; rings: number;
  twist: number; reach: number; width: number; particles: number; duration: number;
}
export interface BossSkill {
  name: string; effect: EffectRecipe; pattern: AttackPattern; color: string;
  radius: number; speed: number; spread: number; bullets: number; delay: number;
}
export interface BossDefinition {
  id: string; name: string; body: BossBody; variant: number; color: string; accent: string;
  interval: number; tactic: string; motion: number; scale: number; skills: readonly [BossSkill, BossSkill];
}
// Explicit roster: every body/variant pair is different, including the first ten familiar silhouettes.
const roster = [
  ['brute', '重锤暴君', 'brute', 0, '#ff6585', '#ffcc82', '陨锤震环', '裂地符印'],
  ['storm', '雷冠君王', 'storm', 0, '#68caff', '#e2c8ff', '苍穹雷链', '星核轰击'],
  ['dragon', '烈焰飞龙', 'dragon', 0, '#ff9a59', '#ffdf89', '焚天吐息', '炎翼回旋'],
  ['scorpion', '毒刺蝎后', 'scorpion', 0, '#a7f178', '#78ffe0', '毒晶喷涌', '尾针裂隙'],
  ['hydra', '三首寒蛇', 'hydra', 0, '#8fffe2', '#b6daff', '三首冰瀑', '霜海怒潮'],
  ['necromancer', '亡灵术士', 'necromancer', 0, '#c49aff', '#ee7db5', '亡魂祭阵', '冥界重压'],
  ['golem', '熔岩巨像', 'golem', 0, '#ffba6d', '#ff797c', '熔核爆柱', '炽电裂地'],
  ['reaper', '镰刃死神', 'reaper', 0, '#79e5ff', '#b6a6ff', '月镰切空', '幽焰收割'],
  ['void', '虚空魔眼', 'void', 0, '#df95ff', '#ff9ed2', '虚空凝视', '蚀骨星雨'],
  ['leviathan', '深海触王', 'leviathan', 0, '#55e7db', '#b9fcff', '潮汐重击', '深海晶刺'],
  ['arachne', '蛛网女皇', 'spider', 0, '#f890cd', '#d6b5ff', '蛛心震荡', '绯丝封印'],
  ['centaur', '铁蹄战将', 'centaur', 0, '#ffc98d', '#87deff', '奔雷长枪', '铁骑崩山'],
  ['manta', '极光蝠王', 'manta', 0, '#89e8ff', '#c0a1ff', '极光燃羽', '流星翼刃'],
  ['phoenix', '不灭火凰', 'phoenix', 0, '#ffba80', '#ff7bab', '凤翎流火', '涅槃星门'],
  ['sentinel', '机甲哨兵', 'sentinel', 0, '#92cff7', '#a0ffce', '聚晶炮阵', '脉冲浪涌'],
  ['seraph', '六翼天使', 'seraph', 0, '#ffe3a1', '#c4daff', '六翼圣阵', '天罚震环'],
  ['serpent', '沙海巨蟒', 'serpent', 0, '#dfbc84', '#ffd9a1', '地脉冲柱', '沙暴雷印'],
  ['crab', '珊瑚蟹王', 'crab', 0, '#ff9bad', '#80e9ed', '珊瑚断刃', '赤潮火线'],
  ['titan', '星陨泰坦', 'titan', 0, '#a5b4ff', '#f6bcff', '星陨黑洞', '星尘毒雨'],
  ['beetle', '金甲虫王', 'beetle', 0, '#ffdb86', '#9fefaa', '金翅洪流', '翡翠晶阵'],
  ['ironlord', '黑铁督军', 'brute', 1, '#a2b3d0', '#ffb882', '铁锤裂空', '战旗封阵'],
  ['thunderbird', '霹雳战皇', 'storm', 1, '#8abaff', '#b9efff', '雷霆交织', '雷核陨落'],
  ['frostdragon', '霜焰魔龙', 'dragon', 1, '#99cfff', '#ffd5ad', '霜焰双息', '寒翼旋斩'],
  ['obsidian', '黑曜蝎君', 'scorpion', 1, '#b4a2f5', '#edb8ff', '黑晶毒爆', '曜石星门'],
  ['basilisk', '翠晶蛇皇', 'hydra', 1, '#bcf289', '#b2fff2', '翠晶寒刺', '蛇皇怒潮'],
  ['oracle', '月蚀祭司', 'necromancer', 1, '#c3bdff', '#ff94c6', '月蚀祭轮', '暗月重压'],
  ['glacier', '冰川巨像', 'golem', 1, '#a4edff', '#dfedff', '冰川崩柱', '寒电震地'],
  ['executioner', '血月刽子手', 'reaper', 1, '#ff8da7', '#c9adff', '血月双镰', '灼魂火网'],
  ['watcher', '千瞳监视者', 'void', 1, '#c9a2ff', '#94d6ff', '千瞳射界', '梦魇毒星'],
  ['kraken', '暗潮海怪', 'leviathan', 1, '#8acde0', '#bfa5ff', '暗潮漩涡', '寒海晶峰'],
  ['silkqueen', '银丝织梦者', 'spider', 1, '#d5c0ff', '#ffb5d5', '织梦震弦', '银丝祭域'],
  ['dreadrider', '幽冥骑将', 'centaur', 1, '#b9a7ff', '#85e7dc', '冥骑雷枪', '幽蹄熔阵'],
  ['skyweaver', '星空翼魔', 'manta', 1, '#aaa2ff', '#8bf3eb', '星翼燃流', '织空刃轮'],
  ['sunphoenix', '日冕神凰', 'phoenix', 1, '#ffdf85', '#ff94b0', '日冕花火', '日核光门'],
  ['ionguard', '离子守卫', 'sentinel', 1, '#8df2ee', '#dfb6ff', '离子晶刃', '电磁洪流'],
  ['fallen', '堕翼裁决者', 'seraph', 1, '#f1a7dc', '#adbeff', '堕翼咒轮', '裁决重压'],
  ['dunewyrm', '流沙龙蟒', 'serpent', 1, '#ffc889', '#f1ae7b', '流沙爆峰', '地磁雷暴'],
  ['abysscrab', '深渊铁钳', 'crab', 1, '#b3b4ea', '#97e5e2', '深渊钳刃', '铁潮焚线'],
  ['moontitan', '月岩泰坦', 'titan', 1, '#c8caff', '#ffddab', '月岩碎界', '月尘星雨'],
  ['scarab', '圣甲太阳虫', 'beetle', 1, '#ffe49d', '#a6e9ff', '圣甲光潮', '太阳晶芒'],
  ['warcolossus', '赤金战神', 'brute', 2, '#ffb575', '#ffd6a5', '赤金崩天', '神域战印'],
  ['tempest', '风暴执政官', 'storm', 2, '#b2d8ff', '#bbffea', '风暴雷网', '飓风陨核'],
  ['astraldragon', '星焰古龙', 'dragon', 2, '#d9a7ff', '#ffb7e0', '星焰洪流', '古龙翼斩'],
  ['emeraldqueen', '翡翠毒后', 'scorpion', 2, '#b5ffa0', '#ecf49e', '翡翠瘴晶', '毒后星穴'],
  ['ancienthydra', '远古九环蛇', 'hydra', 2, '#bdedff', '#f5b6eb', '九环冰雨', '远古海啸'],
  ['chronomancer', '时隙术皇', 'necromancer', 2, '#bcc1ff', '#ffd69e', '时隙祭阵', '时空落锤'],
  ['crystalgiant', '棱晶巨神', 'golem', 2, '#b6f6e9', '#d1b7ff', '棱晶爆林', '镜界雷牢'],
  ['starreaper', '星夜猎魂者', 'reaper', 2, '#afaaff', '#d4f9ff', '星夜刃雨', '猎魂幽火'],
  ['singularity', '奇点吞噬者', 'void', 2, '#f0a5ff', '#87eafc', '奇点坍缩', '粒子侵蚀'],
  ['oceanemperor', '万潮海皇', 'leviathan', 2, '#8ffff0', '#c4cfff', '万潮天幕', '海皇冰棘'],
] as const;
export type BossType = typeof roster[number][0];
const patterns: AttackPattern[] = ['lock', 'cross', 'stagger', 'pincer', 'split', 'summon', 'comet', 'sweep', 'rift', 'orbit'];
const accents = ['#ffe2ab', '#b9e9ff', '#ffc3a1', '#baffb2', '#c4f3ff', '#edc8ff', '#ffca98', '#e9d2ff', '#efbaff', '#bafff4'];
function recipe(profile: number, variation: number): EffectRecipe {
  return {
    id: `${styles[profile]}_${variation}`, style: styles[profile], variation,
    spokes: 3 + variation % 5, rings: 1 + variation % 3, twist: (variation % 2 ? -1 : 1) * (.5 + variation * .13),
    reach: 1.15 + variation * .09, width: .075 + variation * .008,
    particles: 18 + variation * 3, duration: .68 + variation * .025,
  };
}
export const BOSSES = Object.fromEntries(roster.map(([id, name, body, variant, color, accent, a, b], index): [BossType, BossDefinition] => {
  const makeSkill = (slot: number): BossSkill => {
    const profile = (index + slot * 5) % 10;
    const variation = Math.floor(index / 10) * 2 + slot;
    return {
      name: slot ? b : a, effect: recipe(profile, variation),
      pattern: patterns[(profile + Math.floor(index / 10)) % patterns.length],
      color: slot ? accents[profile] : color, radius: .78 + (index % 4) * .04,
      speed: 16 + (index % 5) * 1.5, spread: 1.8 + (index % 3) * .35,
      bullets: 3 + index % 3, delay: .08 + (index % 3) * .06,
    };
  };
  return [id, { id, name, body, variant, color, accent, interval: 1.85 + (index % 4) * .12,
    tactic: `${a} / ${b} · 闪开预警并追踪弱点`, motion: body === 'brute' || body === 'golem' ? 0 : .45 + (index % 5) * .25,
    scale: .92 + (index % 4) * .035, skills: [makeSkill(0), makeSkill(1)] }];
})) as Record<BossType, BossDefinition>;
export const BOSS_TYPES = roster.map(row => row[0]);
export const BOSS_EFFECTS = BOSS_TYPES.flatMap(type => BOSSES[type].skills.map(skill => skill.effect));
