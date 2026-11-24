import './style.css';
import { ATTACK_RANGE, ENEMY_PRESSURE, bossInfo, BOSSES, BOSS_TYPES, BOSS_EFFECTS, compact, Engine, GAME_PACE, WEAPONS, FINAL_WEAPON, FINAL_WEAPON_XP, MASTERY_XP_STEP, type GameEvent } from './engine';
import { GameScene } from './scene';
import { BattleAudio } from './audio';
import { loadRecords, storeRecord, type RunRecord } from './leaderboard';

const icons: Record<string, string> = {
  crown: '<path d="m3 6 4 4 5-7 5 7 4-4-2 13H5L3 6Z"/><path d="M5 16h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  sword: '<path d="m14 4 6-1-1 6-9 9-4-4 8-10Zm-9 9 6 6m-8 2 5-5"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  infinity: '<path d="M12 12c-3-5-9-5-9 0s6 5 9 0 9-5 9 0-6 5-9 0Z"/>',
  hand: '<path d="M9 12V5a2 2 0 0 1 4 0v6-3a2 2 0 0 1 4 0v4-2a2 2 0 0 1 4 0v6c0 3-2 6-6 6h-2c-2 0-4-1-5-3l-5-7c-1-2 1-4 3-2l3 2Z"/>',
  volume: '<path d="m11 4-6 5H2v6h3l6 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5V4Zm5 5 6 6m0-6-6 6"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  pause: '<path d="M8 5v14m8-14v14"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3m1-14a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5"/>',
  trophy: '<path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-4 0h8"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7l0-8Z"/>',
  home: '<path d="m3 10 9-7 9 7v11h-7v-7h-4v7H3V10Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4h.01"/>',
  flame: '<path d="M12 2c2 7-4 7-1 11 2-1 3-3 3-5 7 7 5 14-2 14S1 15 7 9c0 4 2 5 3 5-3-5 2-6 2-12Z"/>',
  snow: '<path d="M12 2v20M3 7l18 10M3 17 21 7m-12-3 3 3 3-3m-6 14 3-3 3 3M3 7l4 1-1 4m15-5-4 1 1 4M3 17l4-1-1-4m15 5-4-1 1-4"/>',
  rocket: '<path d="M9 15C8 7 14 3 21 3c0 7-4 13-12 12Zm0-4-5 1-2 5 7-2m4 0-1 5-5 2 2-7M4 20l3-3"/><circle cx="16" cy="8" r="2"/>',
};
function icon(name: string) { return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.bolt}</svg>`; }
function readSave(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Optional storage. */ } }
function escape(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
const format = (value: number) => Math.floor(value).toLocaleString('en-US');
const weaponIcons = WEAPONS.map(weapon => weapon.icon);

document.querySelector('#app')!.innerHTML = `
  <header class="site-header">
    <a class="brand" href="#camp" aria-label="Top Shooter 首页"><span class="brand-mark">${icon('crown')}</span><span>Top Shooter<span class="brand-subtitle">OVERDRIVE / ENDLESS ARCADE</span></span></a>
    <div class="header-right"><span class="edition"><i></i> 无尽战场 · 火力全开</span><span class="header-divider"></span>
      <button class="icon-button" id="rank-button" aria-label="得分排行榜" title="排行榜">${icon('trophy')}</button>
      <button class="icon-button" id="mobile-help-button" aria-label="玩法提示" title="玩法提示">${icon('help')}</button>
      <button class="icon-button" id="sound-button" aria-label="关闭声音" title="鼓点与战斗音效">${icon('volume')}</button>
      <button class="icon-button" id="fullscreen-button" aria-label="进入全屏" title="全屏">${icon('fullscreen')}</button>
    </div>
  </header>
  <main class="layout">
    <section class="intro">
      <span class="eyebrow"><span></span> NO LIMITS. ALL FIREPOWER.</span>
      <h1>火力全开<span>一战封神<span class="title-period">。</span></span></h1>
      <p class="intro-description">滑动指尖，冲破无尽敌潮。<br>让每一次连杀，点燃下一次爆发。</p>
      <div class="gold-rule"></div>
      <div class="feature-list"><div>${icon('flame')}<span>无限成长</span></div><div>${icon('bolt')}<span>限时决战</span></div><div>${icon('infinity')}<span>无尽挑战</span></div></div>
      <div class="arsenal-preview">${WEAPONS.map((w, i) => `<span style="--weapon-color:${w.color}" title="${w.name}">${icon(weaponIcons[i])}</span>`).join('')}</div>
      <div class="adventure-note"><span class="tiny-star">✦</span> 136 BPM，跟着心跳一路向前。</div>
      <div class="challenge-note"><b>没有终点</b><span>持续加压 / 击杀得分 / 挑战最高纪录</span></div>
    </section>
    <section class="game-column" aria-label="Top Shooter 无尽得分挑战">
      <div class="game-above"><span><i></i> OVERDRIVE</span><span>ENDLESS SCORE ATTACK</span></div>
      <div class="game-frame" id="game-frame" tabindex="0" aria-label="游戏区域，左右拖动或使用方向键">
        <div class="canvas-container" id="canvas-container"></div><div class="vignette"></div><div class="speed-overlay"></div><div class="beat-flash" id="beat-flash"></div>
        <div class="game-hud"><div class="score-display" aria-label="得分"><strong id="score">000000</strong></div><div class="run-metrics"><button class="game-pause" id="pause-button" aria-label="暂停游戏" hidden>${icon('pause')}</button></div></div>
        <div class="combo-display" id="combo-display" hidden><strong id="multiplier">×1</strong></div>
        <div class="boss-hud" id="boss-hud" hidden><span id="boss-name"></span><b id="boss-timer"></b><div class="boss-health"><span id="boss-progress"></span></div></div>
        <div class="troop-badge" id="troop-badge">${icon('users')}<strong id="troops">12</strong></div>
        <div class="toast" id="toast" role="status"></div><div class="event-layer" id="event-layer" aria-hidden="true"></div>
        <div class="start-screen" id="start-screen"><div class="game-title"><div class="title-crown"><span></span>${icon('crown')}<span></span></div><h2>Top Shooter</h2><b class="overdrive-title">OVERDRIVE</b><p>50 位 Boss · 100 套必杀技</p></div>
          <div class="start-bottom"><p class="survival-tip">射击增兵 · 躲避重击</p><label class="nickname-label" for="nickname">射手代号 <input id="nickname" maxlength="12" aria-label="射手代号" autocomplete="off" value="${escape(readSave('top-shooter-nickname', '射手'))}" /></label>
            <button class="primary-button" id="start-button"><span>${icon('flame')} 开始挑战</span>${icon('arrow')}</button><div class="drag-tip"><span class="drag-arrow">←</span>${icon('hand')}<span class="drag-arrow">→</span><span>左右滑动 · 自动开火 · 一局到底</span></div></div>
        </div>
        <div class="bottom-combat" id="bottom-combat" hidden><div class="current-weapon"><span id="weapon-name">${icon('sword')}</span><b id="gear-label">+0</b></div><div class="weapon-progress"><span id="weapon-progress"></span></div><div class="rage-bar"><span id="rage-progress"></span></div></div>
        <div class="modal-shade" id="modal-shade" hidden><section class="game-modal" id="game-modal" aria-label="游戏暂停"></section></div>
        <div class="load-error" id="load-error" hidden><h2>场景暂时无法加载</h2><p>请使用支持 WebGL 的浏览器重新打开。</p><button class="primary-button" id="reload-button">重新加载</button></div>
      </div>
      <div class="game-below"><span>${icon('bolt')} 136 BPM · 开启声音，燃起来</span><span class="keyboard-tip"><kbd>←</kbd><kbd>→</kbd> 左右移动</span></div>
    </section>
    <aside class="guide"><div class="guide-heading"><span class="eyebrow">TOP SHOOTERS / LOCAL TOP 10</span><h2>巅峰排行榜 ${icon('trophy')}</h2><p>本机挑战记录 · 每一分都来自实战</p></div><div id="leaderboard-preview"></div>
      <button class="guide-more" id="all-ranks-button">查看完整排行榜 ${icon('arrow')}</button>
      <div class="score-rules"><span>${icon('bolt')} 连杀越多，得分越高</span><p>5 连杀起叠加倍率，最高 ×5。<br>狂热爆发期间，得分再翻倍。</p><span>${icon('flame')} 战力无限，技巧决定生存</span><p>招募扩军，锻造提升伤害。<br>瞄准弱点，限时击杀 Boss。</p></div>
      <button class="guide-more" id="guide-button">查看武器与战斗技巧 ${icon('arrow')}</button>
    </aside>
  </main>
  <footer class="site-footer"><span>© 2026 Top Shooter <span class="footer-separator">/</span> OVERDRIVE EDITION</span><span>KEEP MOVING. KEEP FIRING. <span class="footer-star">✦</span></span></footer>
  <dialog id="rank-dialog" class="help-dialog rank-dialog"><button class="dialog-close icon-button" id="rank-close" aria-label="关闭排行榜">${icon('close')}</button><span class="eyebrow">LOCAL LEADERBOARD / TOP 10</span><h2>巅峰排行榜</h2><p class="rank-subtitle">本机记录 · 挑战结束后自动保存</p><div id="leaderboard-full"></div></dialog>
  <dialog id="help-dialog" class="help-dialog"><button class="dialog-close icon-button" id="help-close" aria-label="关闭玩法提示">${icon('close')}</button><span class="eyebrow">FIREPOWER IS EVERYTHING</span><h2>火力与生存法则</h2>
    ${WEAPONS.map((w, i) => `<div class="help-row"><span class="help-gate" style="background:${w.color}25;color:${w.color}">${icon(weaponIcons[i])}</span><div><h3>Lv.${i + 1} ${w.name} · ${w.unlock ? `${w.unlock} 点进化经验` : '初始武器'}</h3><p>${w.description}</p></div></div>`).join('')}
    <div class="help-row"><span class="help-gate" style="background:#54ecff25;color:#54ecff">${icon('users')}</span><div><h3>射击人数门 · 负数也能逆转</h3><p>射程覆盖整个可见战场，敌人、补给、各种门与 Boss 一出现就能被瞄准射击；朝目标所在通道移动，弹丸飞抵后结算。人数门成长最快，负数恢复快于正数奖励；例如 −50 可以打成 +20。正数最多再增加 30 人，负数门最多转为 +30。每组只能选一扇，中间可跳过。</p></div></div>
    <div class="help-row"><span class="help-gate" style="background:#a479ed25;color:#a479ed">${icon('sword')}</span><div><h3>扩军与锻造 · 没有上限</h3><p>金门需持续射击约 1 秒解锁，之后每约 0.65 秒增加 ×0.1，最多 ×2.5；开局金门直接可用。紫门每约 2.6 秒增加装备 +1，最多 +3，经过时消耗 8% 兵力。底部细线显示蓄能。更强装备略微加速，人数再多也不能瞬间刷满。</p></div></div>
    <div class="help-row"><span class="help-gate" style="background:#54ecff25;color:#54ecff">${icon('shield')}</span><div><h3>简单开局 · 新手保护</h3><p>开局速度与难度系数 0.7，前 10 个 Boss 每次击破仅增加 0.01，之后每次增加 0.02，最高为 3。从第一波起增加增援，每 5 队敌军额外加入 1 队；敌人和 Boss 的攻击频率、弹幕速度提高 20%。击败前 10 个 Boss 期间，受伤和负数门至少保留 8 名士兵；低难度提供宽范围瞄准辅助，在侧边也能有效攻击 Boss。前三个 Boss 留有充足容错，帮助首次游玩的玩家熟悉走位、招募和武器成长。</p></div></div>
    <div class="help-row"><span class="help-gate" style="background:#ff537e25;color:#ff537e">${icon('shield')}</span><div><h3>Boss 生死战 · 8 秒击杀</h3><p>Boss 出现即可攻击，接近至 28 米时开始 8 秒决战；此前造成的伤害保留，若损兵则下调血量预算。低难度下血量、攻击频率和损兵比例更低，预警更长。持续瞄准 0.85 秒可达 140% 伤害，难度提高后逐步收紧瞄准辅助。低于 45% 血量时狂暴；8 秒结束仍有生命则斩杀整支军团。</p></div></div>
    ${Object.values(BOSSES).map(b => `<div class="help-row"><span class="help-gate" style="background:${b.color}25;color:${b.color}">${icon('shield')}</span><div><h3>${b.name}</h3><p>${b.tactic}</p></div></div>`).join('')}
    <p class="help-footer">0.7 简单开局，难度最高为 3，军团驻守底部，仅左右移动。<br>20 档武器逐级增加伤害，分别有独立弹丸、尾迹与命中效果。<br>补给提供装备 +1、3 点经验及招募；击杀 Boss 也获得装备和兵力。<br>解锁终焉奇点后，每 12 点经验增加一级精通，伤害继续提升。<br>弹幕和碰撞按比例损兵，受伤会中断连击。<br>连续击杀蓄能，自动狂热 6 秒：火力提升、得分翻倍。<br>Boss 缓慢接近、绝不后退；熟悉操作后，瞄准弱点、躲避重击和升级可提升优势。<br><kbd>空格</kbd> 暂停，<kbd>←</kbd> <kbd>→</kbd> 或 A / D 移动。</p>
  </dialog>`;

const elements = new Map<string, HTMLElement>();
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => {
  let element = elements.get(selector);
  if (!element?.isConnected) { element = document.querySelector<HTMLElement>(selector)!; elements.set(selector, element); }
  return element as T;
};
const frame = $('#game-frame'), troopBadge = $('#troop-badge'), modal = $('#game-modal');
const audio = new BattleAudio();
audio.enabled = readSave('top-shooter-sound', 'on') === 'on';
let scene: GameScene | undefined;
let records = loadRecords();
let previousStatus = '';
let savedRun = false;
let runName = '射手';
let runID = '';
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let isDragging = false, dragOrigin = 0, armyOrigin = 0;
const keys = new Set<string>();
function renderRanks() {
  const rows = (limit: number) => records.slice(0, limit).map((r, i) => `<div class="rank-row ${r.id === runID ? 'current-record' : ''}"><b class="rank-number rank-${i + 1}">${String(i + 1).padStart(2, '0')}</b><div><strong>${escape(r.name)}</strong><span>${Math.floor(r.distance)} m · ${r.kills} 击破 · ${r.combo} 连击</span></div><b class="rank-score">${format(r.score)}</b></div>`).join('');
  const empty = `<div class="empty-ranks">${icon('trophy')}<strong>等待第一位神射手</strong><p>开始挑战，用你的得分留下名字。</p></div>`;
  $('#leaderboard-preview').innerHTML = records.length ? rows(5) : empty;
  $('#leaderboard-full').innerHTML = records.length ? rows(10) : empty;
}
renderRanks();
function toast(text: string) {
  $('#toast').textContent = text; $('#toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2100);
}
function onEvent(event: GameEvent) {
  scene?.emit(event); audio.effect(event);
  if (event.type === 'gate') { troopBadge.classList.remove('badge-pop'); void troopBadge.offsetWidth; troopBadge.classList.add('badge-pop'); }
  if (event.type === 'hurt') { frame.classList.remove('damage-flash'); void frame.offsetWidth; frame.classList.add('damage-flash'); }
  if (!(event.type === 'gate' && event.value) && !(event.type === 'kill' && event.boss)) return;
  if ($('#event-layer').childElementCount >= 3) return;
  const label = document.createElement('span');
  label.className = `floating-event ${(event.value ?? 0) < 0 ? 'negative' : event.boss ? 'elite-score' : ''}`;
  label.textContent = `${(event.value ?? 0) >= 0 ? '+' : '−'}${compact(Math.abs(event.value ?? 0))}`;
  const pos = scene?.project(event.x ?? 0, event.boss ? 3 : 1.5, event.z ?? 0);
  if (pos) { label.style.left = `${pos.x}px`; label.style.top = `${pos.y}px`; }
  $('#event-layer').append(label); setTimeout(() => label.remove(), 900);
}
const engine = new Engine(onEvent);
Object.defineProperty(window, '__topShooter', { get: () => ({
  name: 'Top Shooter', bossCount: BOSS_TYPES.length, effectCount: BOSS_EFFECTS.length, weaponCount: WEAPONS.length,
  status: engine.status, score: engine.score, troops: engine.troops, distance: Math.round(engine.distance),
  elapsed: engine.elapsed, difficulty: engine.difficulty, speed: engine.speed, x: Number(engine.x.toFixed(2)),
  weapon: engine.weapon, weaponLevel: engine.weapon + 1, weaponEffect: engine.weaponInfo.id, weaponName: engine.weaponInfo.name, combo: engine.combo, maxCombo: engine.maxCombo,
  fever: engine.fever, kills: engine.kills, power: engine.power, entities: engine.entities.length,
  gear: engine.gearLevel, mastery: engine.mastery, dps: engine.dps, bossesKilled: engine.bossesKilled, defeatReason: engine.defeatReason,
  beginnerProtection: engine.beginnerProtection, bossAimRadius: engine.bossAimRadius, bossAssistDamage: engine.bossAssistDamage,
  boss: engine.boss ? { type: engine.boss.archetype, enraged: engine.boss.enraged, hp: engine.boss.hp, maxHp: engine.boss.maxHp, seconds: engine.boss.bossTime, focus: engine.boss.focus, x: engine.boss.x, z: engine.boss.z } : null,
  formation: scene?.formationState,
  combat: {
    attackRange: ATTACK_RANGE,
    enemyPressure: ENEMY_PRESSURE,
    targets: engine.entities.filter(e => e.active && e.z >= -ATTACK_RANGE && e.z < -.6).map(e => ({
      id: e.id, kind: e.kind, x: e.x, z: e.z, hp: e.hp, maxHp: e.maxHp, value: e.value,
      screenY: scene ? scene.project(e.x, e.kind === 'boss' ? 3 : 1, e.z).y / frame.clientHeight : null,
    })),
    projectiles: engine.bullets.filter(b => b.target).map(b => ({ target: b.target, z: b.z })),
  },
  strikes: engine.strikes.map(s => ({ x: s.x, seconds: s.timer })),
  gates: engine.entities.filter(e => e.kind === 'gate').map(e => ({ id: e.id, x: e.x, z: e.z, value: e.value, operation: e.operation, locked: e.locked, charge: e.gateCharge, limit: e.gateLimit })),
  audio: audio.state,
  archetypes: [...new Set(engine.entities.filter(e => e.active).map(e => e.archetype))],
  bullets: engine.bullets.length, threats: engine.threats.length, records: records.map(r => ({ name: r.name, score: r.score })),
  renderer: scene ? { calls: scene.renderer.info.render.calls, geometries: scene.renderer.info.memory.geometries } : null,
  performance: scene?.performanceState,
}) });
try { scene = new GameScene($('#canvas-container')); } catch (error) {
  console.error('Battlefield initialization failed:', error); $('#load-error').hidden = false; $<HTMLButtonElement>('#start-button').disabled = true;
}
$('#reload-button').addEventListener('click', () => location.reload());
audio.onBeat = strength => {
  scene?.beat(strength);
  $('#beat-flash').style.opacity = String(strength * (engine.fever > 0 ? 0.2 : 0.055));
  setTimeout(() => { $('#beat-flash').style.opacity = '0'; }, 90);
};
function finishRun() {
  if (savedRun || engine.score <= 0 || !runID) return;
  const record: RunRecord = {
    id: runID, name: runName, score: engine.score, distance: engine.distance, kills: engine.kills,
    combo: engine.maxCombo, seconds: engine.elapsed, weapon: engine.weapon, at: Date.now(),
  };
  records = storeRecord(record); savedRun = true; renderRanks();
}
function start() {
  if (!scene) return;
  if (engine.status === 'defeat') engine.reset();
  runName = $<HTMLInputElement>('#nickname').value.trim().slice(0, 12) || '射手';
  save('top-shooter-nickname', runName);
  runID = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  savedRun = false; audio.init(); engine.start(); frame.focus({ preventScroll: true });
}
function camp() { finishRun(); keys.clear(); isDragging = false; engine.reset(); }
$('.brand').addEventListener('click', event => { event.preventDefault(); camp(); });
$('#start-button').addEventListener('click', start);
$('#pause-button').addEventListener('click', () => { keys.clear(); isDragging = false; engine.pause(); });
function updateSound() { $('#sound-button').innerHTML = icon(audio.enabled ? 'volume' : 'mute'); $('#sound-button').setAttribute('aria-label', audio.enabled ? '关闭声音' : '开启声音'); $('#sound-button').setAttribute('aria-pressed', String(audio.enabled)); }
updateSound();
$('#sound-button').addEventListener('click', () => { audio.init(); audio.setEnabled(!audio.enabled); save('top-shooter-sound', audio.enabled ? 'on' : 'off'); updateSound(); });
$('#fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('当前浏览器暂不支持全屏'); } });
function showDialog(id: string) {
  keys.clear(); isDragging = false; if (engine.status === 'playing') engine.pause();
  $<HTMLDialogElement>(id).showModal();
}
$('#rank-button').addEventListener('click', () => showDialog('#rank-dialog'));
$('#all-ranks-button').addEventListener('click', () => showDialog('#rank-dialog'));
$('#guide-button').addEventListener('click', () => showDialog('#help-dialog'));
$('#mobile-help-button').addEventListener('click', () => showDialog('#help-dialog'));
for (const name of ['help', 'rank']) {
  const dialog = $<HTMLDialogElement>(`#${name}-dialog`);
  $(`#${name}-close`).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
}
frame.addEventListener('pointerdown', event => {
  if (engine.status !== 'playing' || (event.target as HTMLElement).closest('button,input')) return;
  isDragging = true; dragOrigin = event.clientX; armyOrigin = engine.targetX;
  frame.setPointerCapture(event.pointerId); frame.focus({ preventScroll: true });
});
frame.addEventListener('pointermove', event => { if (isDragging && engine.status === 'playing') engine.move(armyOrigin + (event.clientX - dragOrigin) / frame.clientWidth * 12); });
frame.addEventListener('pointerup', event => { isDragging = false; if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId); });
frame.addEventListener('pointercancel', () => { isDragging = false; });
window.addEventListener('keydown', event => {
  if ($<HTMLDialogElement>('#help-dialog').open || $<HTMLDialogElement>('#rank-dialog').open || event.target instanceof HTMLInputElement) return;
  const key = event.key.toLowerCase();
  if (['arrowleft', 'arrowright', 'a', 'd'].includes(key)) {
    event.preventDefault();
    if (engine.status === 'playing') { keys.add(key); if (!event.repeat) engine.move(engine.targetX + (['arrowleft', 'a'].includes(key) ? -0.6 : 0.6)); }
  }
  if ((event.code === 'Space' || event.key === 'Escape') && !event.repeat && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); keys.clear(); engine.pause(); }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); isDragging = false; if (engine.status === 'playing') engine.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && engine.status === 'playing') engine.pause(); });

function syncUI() {
  $('#score').textContent = String(Math.floor(engine.score)).padStart(6, '0');
  $('#troops').textContent = compact(engine.troops);
  troopBadge.title = `${engine.troops.toLocaleString('zh-CN')} 位勇士，全员贡献火力`;
  if ($('#weapon-name').dataset.weapon !== String(engine.weapon)) {
    $('#weapon-name').dataset.weapon = String(engine.weapon);
    $('#weapon-name').innerHTML = `${icon(weaponIcons[engine.weapon])}<small>Lv.${engine.weapon + 1}</small>`;
    $('#weapon-name').title = engine.weaponInfo.name;
  }
  $('#gear-label').textContent = `+${compact(engine.gearLevel)}`;
  $('#gear-label').title = `装备 +${compact(engine.gearLevel)} · 火力 ${compact(engine.dps)}/秒`;
  frame.style.setProperty('--weapon-color', engine.weaponInfo.color);
  const lower = WEAPONS[engine.weapon].unlock, upper = WEAPONS[Math.min(FINAL_WEAPON, engine.weapon + 1)].unlock;
  $('#weapon-progress').style.width = `${engine.weapon === FINAL_WEAPON ? (engine.weaponXP - FINAL_WEAPON_XP) % MASTERY_XP_STEP / MASTERY_XP_STEP * 100 : (engine.weaponXP - lower) / (upper - lower) * 100}%`;
  $('#combo-display').hidden = engine.combo < 2 || engine.status === 'ready';
  $('#multiplier').textContent = `×${engine.multiplier}`;
  frame.dataset.fever = String(engine.fever > 0);
  $('#rage-progress').style.width = `${engine.fever > 0 ? engine.fever / 6 * 100 : engine.rage * 100}%`;
  const boss = engine.boss;
  frame.dataset.boss = String(!!boss);
  $('#boss-hud').hidden = !boss || engine.status !== 'playing';
  if (boss) {
    $('#boss-name').textContent = bossInfo(boss.archetype).name;
    $('#boss-timer').textContent = boss.bossTime < 0 ? '◆' : `${boss.bossTime.toFixed(1)}s`;
    $('#boss-hud').dataset.urgent = String(boss.bossTime >= 0 && boss.bossTime < 2);
    $('#boss-hud').dataset.enraged = String(boss.enraged);
    $('#boss-progress').style.width = `${boss.hp / boss.maxHp * 100}%`;
  }
  const pos = scene?.project(engine.x, 1.8, 0);
  if (pos) { troopBadge.style.left = `${pos.x}px`; troopBadge.style.top = `${pos.y}px`; }
  audio.setState(engine.status === 'playing', engine.fever > 0);
  if (previousStatus === engine.status) return;
  previousStatus = engine.status; frame.dataset.state = engine.status;
  $('#start-screen').hidden = engine.status !== 'ready';
  $('#modal-shade').hidden = !['paused', 'defeat'].includes(engine.status);
  $('#pause-button').hidden = engine.status !== 'playing';
  $('#bottom-combat').hidden = engine.status === 'ready' || engine.status === 'defeat';
  troopBadge.hidden = engine.status === 'ready' || engine.status === 'defeat';
  if (engine.status === 'paused') {
    modal.setAttribute('aria-label', '游戏暂停');
    modal.innerHTML = `<div class="modal-emblem">${icon('pause')}</div><span class="eyebrow">CATCH YOUR BREATH</span><h2>火力，稍作停留</h2><p>当前得分 ${format(engine.score)} · ${Math.floor(engine.distance)} m</p><button class="primary-button" id="resume-button">${icon('play')} 继续挑战</button><button class="secondary-button" id="home-button">${icon('home')} 结束并记录</button>`;
    $('#resume-button').addEventListener('click', () => { engine.pause(); frame.focus({ preventScroll: true }); });
    $('#home-button').addEventListener('click', camp);
  }
  if (engine.status === 'defeat') {
    finishRun();
    const rank = records.findIndex(r => r.id === runID);
    modal.setAttribute('aria-label', '挑战结束');
    modal.innerHTML = `<div class="modal-emblem">${icon('trophy')}</div><span class="eyebrow">RUN COMPLETE</span><h2>本次挑战结束</h2><p class="defeat-reason">${escape(engine.defeatReason)}</p><div class="final-score">${format(engine.score)}</div><span class="result-rank">${rank >= 0 ? `本机排行榜 · 第 ${rank + 1} 名` : '继续冲击本机 TOP 10'}</span><div class="result-stats"><div><strong>${Math.floor(engine.distance)}</strong><span>抵御敌潮</span></div><div><strong>${engine.bossesKilled}</strong><span>Boss 击破</span></div><div><strong>+${engine.gearLevel}</strong><span>最高装备</span></div></div><button class="primary-button" id="retry-button">${icon('flame')} 再次挑战</button><button class="secondary-button" id="home-button">${icon('home')} 返回营地</button>`;
    $('#retry-button').addEventListener('click', start); $('#home-button').addEventListener('click', camp);
  }
}
let last = performance.now(), lastUI = 0, lastRender = 0;
function loop(now: number) {
  const dt = (now - last) / 1000; last = now;
  if (engine.status === 'playing') {
    const direction = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
    if (direction) engine.move(engine.targetX + direction * Math.min(dt, 0.1) * 10 * GAME_PACE);
  }
  engine.update(dt);
  if (engine.status === 'playing' || now - lastRender >= 1000 / 30) {
    scene?.render(engine, (now - lastRender) / 1000); lastRender = now;
  }
  if (now - lastUI > 60 || engine.status !== previousStatus) { syncUI(); lastUI = now; }
  requestAnimationFrame(loop);
}
syncUI(); requestAnimationFrame(loop);
