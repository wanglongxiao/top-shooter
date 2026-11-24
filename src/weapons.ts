export type WeaponVisual = 'dart' | 'shard' | 'flame' | 'lightning' | 'rocket' | 'blades' | 'swarm' | 'rail' | 'drill' | 'disc' |
  'star' | 'pulse' | 'comet' | 'cross' | 'rainbow' | 'spear' | 'prism' | 'crescent' | 'nova' | 'singularity';
export interface WeaponDefinition {
  id: WeaponVisual; name: string; tag: string; color: string; accent: string; icon: string;
  unlock: number; interval: number; speed: number; damage: number; description: string;
  volley: number; targets: number; tracking: number; splash: number; chains: number; burn: number; slow: number;
  visual: { spin: number; size: number; trailWidth: number; trailLength: number; rings: number; spokes: number };
  audio: { pitch: number; end: number; wave: OscillatorType; length: number; noise: number };
}
// One real projectile silhouette and attack envelope per tier, rather than a recolored mastery level.
const rows = [
  ['dart', '疾风连弩', '#ffe68a', '#fff7d0', 'sword', 0, .115, 85, 1, '细长箭雨与金色尾光，稳定压制。'],
  ['shard', '冰晶散射', '#54edff', '#c1faff', 'snow', 4, .10, 90, 1.2, '棱晶散射，减缓多个目标。'],
  ['flame', '烈焰风暴', '#ff863b', '#ffdd7b', 'flame', 10, .10, 66, 1.4, '火团与焰尾，范围灼烧。'],
  ['lightning', '雷霆连锁', '#c195ff', '#e9d7ff', 'bolt', 18, .14, 150, 2.25, '折线电弧，连锁打击附近目标。'],
  ['rocket', '追踪火箭', '#ff537e', '#ffd0ba', 'rocket', 30, .18, 78, 3.25, '带翼火箭追踪，爆炸波及敌群。'],
  ['blades', '双旋飞刃', '#7ee7ed', '#e4ffff', 'sword', 38, .18, 88, 3.7, '双月刃旋转飞行，切入周围敌人。'],
  ['swarm', '翠晶蜂群', '#a2ee6d', '#eaffba', 'snow', 46, .18, 93, 4.2, '四晶蜂群分散追敌，延缓冲锋。'],
  ['rail', '紫电轨炮', '#9d9cff', '#e5e6ff', 'bolt', 54, .18, 170, 4.8, '双轨长束，电弧串联四个目标。'],
  ['drill', '赤焰钻弹', '#ff9d62', '#ffe5a1', 'flame', 62, .18, 92, 5.5, '螺环钻头冲击，爆炸与燃烧叠加。'],
  ['disc', '极光光盘', '#62e2c4', '#d5fffa', 'sword', 72, .18, 99, 6.3, '旋转光盘与扩散光环，横扫敌群。'],
  ['star', '寒星棱枪', '#95dfff', '#ffffff', 'snow', 82, .18, 108, 7.2, '六芒冰星散射，冻结多路敌人。'],
  ['pulse', '日冕脉冲', '#ffd66c', '#fff2c3', 'bolt', 92, .18, 125, 8.3, '脉冲双环推进，电弧扩散。'],
  ['comet', '幽焰彗星', '#ce8bff', '#ffd1f2', 'flame', 104, .18, 94, 9.5, '彗星核与三重焰尾，持续焚烧。'],
  ['cross', '磁暴十字', '#77b8ff', '#dcf4ff', 'bolt', 116, .18, 140, 10.9, '磁暴十字旋转，连锁切断敌潮。'],
  ['rainbow', '虹彩星环', '#ed94d4', '#8cfff0', 'sword', 128, .18, 105, 12.5, '双轴星环交织，减速与范围冲击。'],
  ['spear', '熔核流矛', '#ffba78', '#ffedb3', 'flame', 142, .18, 132, 14.3, '熔核长矛拖出焰线，持续灼烧。'],
  ['prism', '虚空棱镜', '#b29cff', '#b8fff7', 'snow', 156, .18, 145, 16.3, '五棱星镜折射，六次连锁减速。'],
  ['crescent', '风暴月轮', '#75e1ff', '#eed5ff', 'sword', 170, .18, 118, 18.6, '三道月轮倾斜旋舞，范围电刃。'],
  ['nova', '天穹星束', '#ffb8d6', '#fff0b6', 'bolt', 186, .18, 155, 21.2, '六星轨道环绕，星核冲击敌群。'],
  ['singularity', '终焉奇点', '#d1acff', '#8effed', 'rocket', 202, .18, 124, 24.2, '暗核、双轴星环与引力弧，复合打击。'],
] as const;
const splash = [0, 0, 1.8, 0, 3.5, 1.5, 0, 0, 2.4, 2.8, 0, 1.8, 3.2, 0, 3.2, 1.5, 0, 3.1, 3.7, 4];
const chains = [0, 0, 0, 3, 0, 1, 0, 4, 0, 1, 0, 4, 0, 4, 1, 2, 6, 3, 4, 5];
const burns = [0, 0, 1.5, 0, 0, 0, 0, 0, 1.7, 0, 0, 0, 2.1, 0, 0, 2.2, 0, 0, 0, 1.2];
const slows = [0, .6, 0, 0, 0, 0, .65, 0, 0, 0, .9, 0, 0, 0, .6, 0, .7, 0, 0, .9];
const pitches = [820, 1060, 210, 1380, 180, 690, 920, 430, 240, 610, 1180, 360, 270, 790, 980, 155, 540, 670, 330, 125];
export const WEAPONS: readonly WeaponDefinition[] = rows.map(([id, name, color, accent, icon, unlock, interval, speed, damage, description], index) => ({
  id, name, tag: id.toUpperCase(), color, accent, icon, unlock, interval, speed, damage, description,
  volley: [4, 8, 10, 16, 19].includes(index) ? 4 : 8,
  targets: [1, 6, 10, 13, 16, 18].includes(index) ? 3 : 1,
  tracking: index >= 4 ? 8 + index * .12 : 5,
  splash: splash[index], chains: chains[index], burn: burns[index], slow: slows[index],
  visual: { spin: index < 4 ? 0 : (index % 2 ? -1 : 1) * (2 + index * .3), size: 1 + index * .012,
    trailWidth: .035 + index * .0025, trailLength: .7 + index * .065, rings: 1 + Math.floor(index / 6), spokes: 2 + index % 5 },
  audio: { pitch: pitches[index], end: index % 3 ? pitches[index] * .42 : pitches[index] * 1.3,
    wave: (['triangle', 'sine', 'triangle', 'square'] as const)[index % 4],
    length: .045 + index % 4 * .012, noise: [2, 4, 8, 12, 15, 19].includes(index) ? .007 : 0 },
}));
export const FINAL_WEAPON = WEAPONS.length - 1;
export const MASTERY_XP_STEP = 12;
export const FINAL_WEAPON_XP = WEAPONS[FINAL_WEAPON].unlock;
