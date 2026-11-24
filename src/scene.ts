import * as THREE from 'three';
import { BOSS_EFFECTS, type EffectRecipe } from './bosses';
import { projectileGeometry } from './weapon-visuals';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ATTACK_RANGE, BOSS_AIM_RADIUS, bossInfo, compact, GAME_PACE, gateProgress, WEAPONS, type AttackStyle, type Engine, type Entity, type GameEvent, type EnemyType } from './engine';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const colors = {
  blue: '#208ed4', blueDark: '#135ca1', blueLight: '#4dbef0',
  red: '#d95144', redDark: '#a23335', gold: '#efc36b', stone: '#e4d5b4',
  skin: '#f2c39b', metal: '#abc4cd', boot: '#694937',
};
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const sharedMaterials = new Set<THREE.Material>();
const effectRecipes = new Map(BOSS_EFFECTS.map(effect => [effect.id, effect]));
const axialWeapons = new Set([0, 2, 4, 7, 8, 12, 15]);
const bossMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .42, metalness: .22, flatShading: true, side: THREE.DoubleSide });
sharedMaterials.add(bossMaterial);
// Merge rigid parts within each animated joint; keep emissive and transparent layers separate.
function mergeBossParts(parent: THREE.Object3D) {
  for (const child of [...parent.children]) if (child instanceof THREE.Group) mergeBossParts(child);
  const parts: THREE.BufferGeometry[] = [];
  for (const child of [...parent.children]) {
    if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial) || child.material.transparent) continue;
    child.updateMatrix();
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    if (!geometry.hasAttribute('color')) {
      const color = child.material.color, data = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < data.length; i += 3) { data[i] = color.r; data[i + 1] = color.g; data[i + 2] = color.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    }
    geometry.deleteAttribute('uv');
    parts.push(geometry); parent.remove(child); child.geometry.dispose();
    if (!sharedMaterials.has(child.material)) child.material.dispose();
  }
  if (!parts.length) return;
  const merged = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  const mesh = new THREE.Mesh(merged, bossMaterial); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
}
function gateText(e: Entity) {
  if (e.operation === 'multiply') return `${e.locked ? '◇ ' : ''}×${e.value}`;
  if (e.operation === 'forge') return `⚒ +${e.value}`;
  const value = e.operation === 'subtract' ? -e.value : e.value;
  return `${value < 0 ? '−' : '+'}${compact(Math.abs(value))}`;
}
function gateColor(e: Entity) {
  return e.operation === 'forge' ? '#9971ea' : e.operation === 'multiply' ? '#d6a94c' :
    (e.operation === 'subtract' ? -e.value : e.value) < 0 ? '#bf334a' : '#1683cc';
}
function material(color: string, roughness = 0.8) {
  const key = color + roughness;
  if (!materialCache.has(key)) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, flatShading: true });
    materialCache.set(key, mat); sharedMaterials.add(mat);
  }
  return materialCache.get(key)!;
}
function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(parent: THREE.Object3D, rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0, sides = 8) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, sides), material(color));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// One merged, vertex-colored geometry per soldier; entire armies use two draw calls.
function soldierGeometry(team: 'blue' | 'red', hero = false, archetype: EnemyType = 'raider') {
  const parts: THREE.BufferGeometry[] = [];
  const main = team === 'blue' ? colors.blue : archetype === 'mage' ? '#9457de' : archetype === 'guard' || archetype === 'brute' ? '#59647b' : archetype === 'runner' ? '#fa8243' : '#ed394f';
  const dark = team === 'blue' ? colors.blueDark : archetype === 'mage' ? '#46216b' : archetype === 'brute' ? '#252939' : colors.redDark;
  function part(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(1, 1, 1),
    );
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const data = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) {
      data[i] = c.r; data[i + 1] = c.g; data[i + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(data, 3));
    parts.push(g);
  }
  part(new THREE.BoxGeometry(0.18, 0.21, 0.31), colors.boot, -0.15, 0.1, 0.02);
  part(new THREE.BoxGeometry(0.18, 0.21, 0.31), colors.boot, 0.15, 0.1, 0.02);
  part(new THREE.CylinderGeometry(0.22, 0.3, 0.4, 7), main, 0, 0.44, 0);
  part(new THREE.CylinderGeometry(0.25, 0.25, 0.07, 8), '#825535', 0, 0.35, 0);
  part(new THREE.SphereGeometry(0.18, 8, 5), colors.skin, 0, 0.76, -0.01);
  part(new THREE.SphereGeometry(0.245, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.8), main, 0, 0.8, 0);
  part(new THREE.BoxGeometry(.3, .045, .2), hero ? colors.gold : colors.metal, 0, .99, 0);
  part(new THREE.BoxGeometry(.29, .07, .025), '#82e5ff', 0, .82, -.2);
  part(new THREE.BoxGeometry(.26, .18, .05), hero ? colors.gold : '#a9d6eb', 0, .57, -.23);
  part(new THREE.BoxGeometry(.06, .12, .055), '#d7fcff', 0, .58, -.26);
  part(new THREE.CylinderGeometry(0.245, 0.245, 0.045, 8), hero ? colors.gold : colors.metal, 0, 0.86, 0);
  part(new THREE.BoxGeometry(0.032, 0.25, 0.032), hero ? colors.gold : colors.metal, 0, 1.0, -0.19, -0.25);
  part(new THREE.SphereGeometry(0.14, 6, 4), main, -0.29, 0.62, 0);
  part(new THREE.SphereGeometry(0.14, 6, 4), main, 0.29, 0.62, 0);
  part(new THREE.BoxGeometry(0.16, 0.22, 0.15), colors.skin, -0.29, 0.45, -0.13, -0.6);
  part(new THREE.BoxGeometry(0.16, 0.22, 0.15), colors.skin, 0.29, 0.45, -0.13, -0.6);
  // Cape shows clearly from the elevated chase camera.
  part(new THREE.CylinderGeometry(0.16, 0.28, 0.43, 4, 1, false, 0, Math.PI), dark, 0, 0.48, 0.19);
  if (team === 'blue') {
    part(new THREE.BoxGeometry(.25, .15, .46), '#26465e', 0, .52, -.4);
    part(new THREE.BoxGeometry(.27, .05, .28), colors.metal, 0, .62, -.45);
    part(new THREE.CylinderGeometry(.045, .045, .36, 6), '#d0e6ee', 0, .53, -.72, Math.PI / 2);
    part(new THREE.BoxGeometry(.06, .05, .24), '#65d9ff', 0, .65, -.45);
    part(new THREE.CylinderGeometry(.06, .06, .05, 6), '#82efff', 0, .53, -.9, Math.PI / 2);
  } else {
    part(new THREE.CylinderGeometry(0.21, 0.21, 0.07, 10), '#849da6', -0.29, 0.53, -0.2, Math.PI / 2);
    part(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), main, -0.29, 0.53, -0.22, Math.PI / 2);
    part(new THREE.BoxGeometry(0.045, 0.57, 0.065), colors.metal, 0.35, 0.8, -0.12, 0, 0, -0.22);
    part(new THREE.BoxGeometry(0.2, 0.04, 0.085), colors.gold, 0.39, 0.57, -0.12);
    if (archetype === 'mage') {
      part(new THREE.ConeGeometry(0.3, 0.5, 6), main, 0, 1.14, 0);
      part(new THREE.CylinderGeometry(0.032, 0.032, 1.3, 6), '#59415e', 0.45, 0.75, 0);
      part(new THREE.IcosahedronGeometry(0.18), '#d68bff', 0.45, 1.46, 0);
    }
    if (archetype === 'guard' || archetype === 'brute') {
      part(new THREE.BoxGeometry(0.68, 0.18, 0.45), main, 0, 0.68, 0);
      part(new THREE.ConeGeometry(0.08, 0.25, 4), '#e5d4b6', -0.35, 0.85, 0);
      part(new THREE.ConeGeometry(0.08, 0.25, 4), '#e5d4b6', 0.35, 0.85, 0);
    }
  }
  if (hero) {
    part(new THREE.ConeGeometry(0.09, 0.4, 5), colors.gold, 0, 1.24, 0.04, -0.35);
    part(new THREE.BoxGeometry(0.09, 0.11, 0.035), colors.gold, 0, 0.58, 0.38);
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return geometry;
}

function paintText(canvas: HTMLCanvasElement, text: string, background: string, small?: string) {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(canvas.width / 512, canvas.height / (small ? 256 : 160));
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 512, small ? 256 : 160);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(0, 0, canvas.width, 9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (small) {
    ctx.font = 'bold 29px Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillText(small, 256, 49);
  }
  const fontSize = small ? 123 : 98;
  ctx.font = `900 ${fontSize}px Arial, sans-serif`;
  if (ctx.measureText(text).width > 475) ctx.font = `900 ${Math.floor(fontSize * 475 / ctx.measureText(text).width)}px Arial, sans-serif`;
  ctx.lineWidth = 9;
  ctx.strokeStyle = '#193e56';
  ctx.strokeText(text, 256, small ? 150 : 86);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 256, small ? 150 : 86);
  ctx.restore();
}
function textTexture(text: string, background: string, small?: string) {
  const canvas = document.createElement('canvas');
  canvas.width = small ? 512 : 256;
  canvas.height = small ? 256 : 80;
  paintText(canvas, text, background, small);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

interface Visual { group: THREE.Group; label?: THREE.Sprite; hp?: string; shieldHp?: string; charge?: number; labelTime?: number; locked?: boolean; banner?: THREE.Mesh; floor?: THREE.Mesh; textures: THREE.Texture[]; joints?: THREE.Object3D[] }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; color: THREE.Color }
interface Shockwave { mesh: THREE.Mesh; life: number; max: number }
interface Chain { line: THREE.Line; life: number }
interface BattleEffect { x: number; z: number; toX: number; toZ: number; life: number; max: number; radius: number; cast: boolean; color: THREE.Color; style: AttackStyle; source?: number; recipe: EffectRecipe }
interface PlayerBurst { x: number; z: number; weapon: number; kind: 'shot' | 'hit' | 'ultimate'; life: number; max: number }

export class GameScene {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  private container: HTMLElement;
  private road: THREE.Group;
  private blue: THREE.InstancedMesh;
  private enemies = new Map<EnemyType, THREE.InstancedMesh>();
  private hero: THREE.Mesh;
  private shots: THREE.InstancedMesh[] = [];
  private shotCounts = new Uint16Array(WEAPONS.length);
  private trails: THREE.InstancedMesh;
  private threats: THREE.InstancedMesh;
  private threatBatches = new Map<string, THREE.InstancedMesh>();
  private threatTrails: THREE.InstancedMesh;
  private strikeZones: THREE.InstancedMesh;
  private strikeAreas: THREE.InstancedMesh;
  private weakPoint: THREE.Mesh;
  private sparks: THREE.InstancedMesh;
  private visuals = new Map<number, Visual>();
  private particles: Particle[] = [];
  private particlePool: Particle[] = [];
  private effectColors = new Map<string, THREE.Color>();
  private dummy = new THREE.Object3D();
  private animationTime = 0;
  private resizeObserver: ResizeObserver;
  private armyRing: THREE.Mesh;
  private seaMaterial: THREE.ShaderMaterial;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private waves: Shockwave[] = [];
  private chains: Chain[] = [];
  private shake = 0;
  private pulse = 0;
  private weaponRig = new THREE.Group();
  private rigIndex = -1;
  private recoil = 0;
  private playerBursts: PlayerBurst[] = [];
  private burstPool: PlayerBurst[] = [];
  private lastHitBurst = -1;
  private tiles?: THREE.InstancedMesh;
  private biome = -1;
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private cameraY = 11;
  private cameraZ = 13;
  private cameraTargetZ = -8;
  private entityIndex = new Map<number, Entity>();
  private tint = new THREE.Color();
  private weaponColors = WEAPONS.map(w => new THREE.Color(w.color));
  private frameMs = 16.67;
  private renderMs = 0;
  private qualityTimer = 0;
  private labelUpdates = 0;
  private pixelRatio = Math.min(window.devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.25 : 1.5);
  private battleEffects: BattleEffect[] = [];
  private battlePool: BattleEffect[] = [];
  private beams: THREE.InstancedMesh;
  private columns: THREE.InstancedMesh;
  private sigils: THREE.InstancedMesh;
  private slashes: THREE.InstancedMesh;
  private effectDirection = new THREE.Vector3();
  private axisY = new THREE.Vector3(0, 1, 0);

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#b8e0e4');
    this.scene.fog = new THREE.Fog('#b8e0e4', 65, 142);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 190);
    this.camera.position.set(0, 11, 13);
    this.camera.lookAt(0, 0, -8);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute('aria-label', '3D 城堡桥面战场，左右拖动控制蓝色军团');
    this.renderer.domElement.setAttribute('role', 'img');
    container.prepend(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight('#c4dfff', '#857994', 1.7));
    const sun = new THREE.DirectionalLight('#ffe6c3', 2.4);
    sun.position.set(-14, 28, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -16;
    sun.shadow.camera.right = 16;
    sun.shadow.camera.top = 38;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.far = 80;
    sun.shadow.normalBias = 0.03;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    sun.target.position.set(0, 0, -13);
    this.scene.add(sun.target);

    this.seaMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, tint: { value: new THREE.Vector3(0.08, 0.44, 0.57) } },
      vertexShader: `
        varying vec3 vPosition;
        uniform float time;
        uniform vec3 tint;
        void main() {
          vec3 p = position;
          p.z += sin(p.x * .32 + time * .65) * .12 + cos(p.y * .25 + time * .45) * .08;
          vPosition = p;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vPosition;
        uniform float time;
        uniform vec3 tint;
        void main() {
          float wave = sin(vPosition.y * 2.0 + sin(vPosition.x * .38 + time * .5) * 2.0 + time);
          float light = smoothstep(.93, 1.0, wave) * .14;
          float broad = sin(vPosition.x * .13 + vPosition.y * .08) * .5 + .5;
          float ripple = sin(vPosition.x * .48 + vPosition.y * .3 + time * .6) * .5 + .5;
          float glint = pow(max(0.0, sin(vPosition.y * 1.6 - time * .8) * cos(vPosition.x * .22 + time * .3)), 18.0);
          vec3 c = tint * (.8 + broad * .3 + ripple * .08) + light * vec3(.65, .9, 1.) + glint * vec3(.11, .16, .18);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 65, 65), this.seaMaterial);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.3;
    this.scene.add(sea);
    this.road = this.makeRoad();
    this.scene.add(this.road);
    this.makeWorld();
    this.mergeStaticWorld();

    const unitMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true });
    this.blue = new THREE.InstancedMesh(soldierGeometry('blue'), unitMaterial, 150);
    this.blue.castShadow = true;
    this.blue.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.blue.frustumCulled = false;
    for (const type of ['raider', 'guard', 'runner', 'mage'] as EnemyType[]) {
      const batch = new THREE.InstancedMesh(soldierGeometry('red', false, type), unitMaterial, 160);
      batch.castShadow = true;
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage); batch.frustumCulled = false;
      this.enemies.set(type, batch); this.scene.add(batch);
    }
    this.hero = new THREE.Mesh(soldierGeometry('blue', true), unitMaterial);
    this.hero.castShadow = true;
    this.scene.add(this.blue, this.hero, this.weaponRig);
    for (const weapon of WEAPONS) {
      const mesh = new THREE.InstancedMesh(projectileGeometry(weapon), new THREE.MeshBasicMaterial({ vertexColors: true }), 180);
      mesh.count = 0;
      mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.shots.push(mesh); this.scene.add(mesh);
    }
    this.trails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 1.8), new THREE.MeshBasicMaterial({ color: 'white', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }), 180);
    this.trails.frustumCulled = false; this.scene.add(this.trails);
    this.threats = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 1), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 160);
    this.threatBatches.set('orb', this.threats);
    const makeBatch = (geometry: THREE.BufferGeometry, capacity: number, opacity = 1) => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({
        color: 'white', transparent: opacity < 1, opacity, blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide,
      }), capacity);
      mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(mesh); return mesh;
    };
    this.threatBatches.set('spike', makeBatch(new THREE.ConeGeometry(.22, .9, 5), 160));
    this.threatBatches.set('blade', makeBatch(new THREE.TorusGeometry(.45, .075, 4, 12, Math.PI * 1.4), 160));
    this.threatBatches.set('bolt', makeBatch(new THREE.OctahedronGeometry(.3), 160));
    this.threatTrails = makeBatch(new THREE.BoxGeometry(.11, .11, 1), 160, .4);
    this.beams = makeBatch(new THREE.CylinderGeometry(1, 1, 1, 6), 64, .65);
    this.columns = makeBatch(new THREE.ConeGeometry(1, 1, 6), 64, .6);
    this.sigils = makeBatch(new THREE.RingGeometry(.9, 1, 6), 64, .65);
    this.slashes = makeBatch(new THREE.TorusGeometry(1, .055, 4, 24, Math.PI * 1.6), 64, .85);
    this.strikeZones = new THREE.InstancedMesh(new THREE.RingGeometry(0.82, 0.98, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }), 16);
    this.strikeZones.frustumCulled = false;
    this.strikeAreas = new THREE.InstancedMesh(new THREE.BoxGeometry(2, .018, 7),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .2, depthWrite: false }), 16);
    this.strikeAreas.frustumCulled = false;
    this.weakPoint = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.065, 6, 32), new THREE.MeshBasicMaterial({ color: '#54edff', depthTest: false, transparent: true, opacity: 0.9 }));
    this.weakPoint.renderOrder = 5; this.weakPoint.visible = false;
    this.scene.add(this.strikeZones, this.strikeAreas, this.weakPoint);
    this.threats.frustumCulled = false; this.scene.add(this.threats);
    this.sparks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: 'white' }), 420);
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.armyRing = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.26, 64),
      new THREE.MeshBasicMaterial({ color: '#7be2ff', transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
    );
    this.armyRing.rotation.x = -Math.PI / 2;
    this.armyRing.position.y = 0.08;
    this.scene.add(this.armyRing);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(container.clientWidth, container.clientHeight), 0.55, 0.35, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#ffbc5f', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.visible = false;
      this.waves.push({ mesh, life: 0, max: 0.5 }); this.scene.add(mesh);
    }
    for (let i = 0; i < 48; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3).setUsage(THREE.DynamicDrawUsage));
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#deb1ff', transparent: true, depthWrite: false }));
      line.frustumCulled = false; line.visible = false;
      this.chains.push({ line, life: 0 }); this.scene.add(line);
    }
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    // Keep the entire bridge and a large army visible at both lateral extremes.
    // Dolly along a fixed viewing angle while anchoring the frontline at 77% height.
    const tilt = Math.atan(11 / 21), tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const depth = 5.1 / (tangent * this.camera.aspect) + 2.5 * Math.cos(tilt);
    const vertical = -2 * (0.77 - 0.5) * depth * tangent;
    this.cameraY = depth * Math.sin(tilt) - vertical * Math.cos(tilt);
    this.cameraZ = depth * Math.cos(tilt) + vertical * Math.sin(tilt);
    this.cameraTargetZ = this.cameraZ - this.cameraY / Math.tan(tilt);
    this.camera.position.set(0, this.cameraY, this.cameraZ);
    this.camera.lookAt(0, 0, this.cameraTargetZ);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  // Fixed scenery sharing a material is submitted as one mesh, including shadows.
  private mergeStaticWorld() {
    this.scene.updateMatrixWorld(true);
    const batches = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; parts: THREE.BufferGeometry[] }>();
    const meshes: THREE.Mesh[] = [];
    this.scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh) || obj instanceof THREE.InstancedMesh ||
        Array.isArray(obj.material) || obj.material instanceof THREE.ShaderMaterial) return;
      const key = `${obj.material.uuid}/${obj.castShadow}/${obj.receiveShadow}`;
      let batch = batches.get(key);
      if (!batch) { batch = { material: obj.material, cast: obj.castShadow, receive: obj.receiveShadow, parts: [] }; batches.set(key, batch); }
      batch.parts.push(obj.geometry.clone().applyMatrix4(obj.matrixWorld));
      meshes.push(obj);
    });
    for (const mesh of meshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
    for (const batch of batches.values()) {
      const geometry = mergeGeometries(batch.parts)!;
      for (const part of batch.parts) part.dispose();
      const mesh = new THREE.Mesh(geometry, batch.material);
      mesh.castShadow = batch.cast; mesh.receiveShadow = batch.receive;
      this.scene.add(mesh);
    }
  }

  private makeRoad() {
    const road = new THREE.Group();
    const foundation = box(road, 9.2, 1.5, 145, '#b9ab8d', 0, -0.78, -46);
    foundation.receiveShadow = true;
    const tileGeo = new THREE.BoxGeometry(1.1, 0.12, 1.66);
    const tiles = new THREE.InstancedMesh(tileGeo, material('#e5d5b6'), 8 * 86);
    tiles.receiveShadow = true;
    this.tiles = tiles;
    const palette = ['#e6d8ba', '#ded0b2', '#eadcc0', '#e1d1b2', '#dccdad'];
    let index = 0;
    for (let row = 0; row < 86; row++) {
      for (let col = 0; col < 8; col++) {
        this.dummy.position.set((col - 3.5) * 1.12 + (row % 2 ? 0.12 : 0), -0.04, -117 + row * 1.7);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(1, 1, 1);
        this.dummy.updateMatrix();
        tiles.setMatrixAt(index, this.dummy.matrix);
        tiles.setColorAt(index++, new THREE.Color(palette[(row * 13 + col * 7) % palette.length]));
      }
    }
    road.add(tiles);
    const wallGeo = new THREE.BoxGeometry(0.48, 0.76, 1.62);
    const walls = new THREE.InstancedMesh(wallGeo, material('#d8ceb7'), 172);
    walls.castShadow = true;
    walls.receiveShadow = true;
    index = 0;
    for (let row = 0; row < 86; row++) {
      for (const side of [-1, 1]) {
        this.dummy.position.set(side * 4.72, 0.24, -117 + row * 1.7);
        this.dummy.updateMatrix();
        walls.setMatrixAt(index, this.dummy.matrix);
        walls.setColorAt(index++, new THREE.Color(row % 3 === 0 ? '#e4dac4' : '#d6cbb2'));
      }
    }
    road.add(walls);
    for (const x of [-4.72, 4.72]) {
      box(road, 0.6, 0.13, 145, '#e9dfc6', x, 0.68, -46);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 145), new THREE.MeshBasicMaterial({ color: '#50d5eb', transparent: true, opacity: 0.7 }));
      rail.position.set(x * 0.95, 0.74, -46); road.add(rail);
      for (let z = -105; z < 20; z += 12) {
        cylinder(road, 0.12, 0.17, 1.2, '#5d6a76', x, 1, z);
        const fire = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), new THREE.MeshBasicMaterial({ color: '#ffb64b' }));
        fire.position.set(x, 1.75, z); fire.scale.y = 1.7; road.add(fire);
      }
    }
    const inlays = new THREE.InstancedMesh(new THREE.PlaneGeometry(.08, .5),
      new THREE.MeshBasicMaterial({ color: '#a5efff', transparent: true, opacity: .36, depthWrite: false }), 96);
    let inlay = 0;
    for (let row = 0; row < 48; row++) for (const side of [-1, 1]) {
      this.dummy.position.set(side * 3.85, .018, -114 + row * 2.7);
      this.dummy.rotation.set(-Math.PI / 2, 0, side * .2);
      this.dummy.scale.setScalar(1); this.dummy.updateMatrix(); inlays.setMatrixAt(inlay++, this.dummy.matrix);
    }
    road.add(inlays);
    return road;
  }

  private makeWorld() {
    const castle = new THREE.Group();
    castle.position.z = -86;
    const tower = (x: number, z: number, height: number, radius: number) => {
      cylinder(castle, radius, radius + 0.2, height, '#d2cbb5', x, height / 2 - 0.7, z, 10);
      cylinder(castle, radius + 0.2, radius + 0.2, 0.35, '#e7dec8', x, height - 0.7, z, 10);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        box(castle, 0.65, 0.7, 0.65, '#e9e1cf', x + Math.cos(a) * radius, height - 0.25, z + Math.sin(a) * radius);
      }
      const roof = new THREE.Mesh(new THREE.ConeGeometry(radius + 0.35, 3, 10), material('#327f93'));
      roof.position.set(x, height + 1.6, z);
      castle.add(roof);
      cylinder(castle, 0.04, 0.04, 1.4, '#c6ad67', x, height + 3.45, z);
      box(castle, 0.8, 0.5, 0.04, '#e8b957', x + 0.4, height + 3.8, z);
      box(castle, 0.4, 0.9, 0.1, '#617d80', x, height * 0.63, z + radius);
    };
    tower(-5.3, 0, 8, 2);
    tower(5.3, 0, 8, 2);
    tower(0, -6, 13, 2.7);
    box(castle, 6, 5, 1.5, '#d3c9ae', 0, 1.8, -1.8);
    box(castle, 3, 3.5, 1.6, '#536765', 0, 1, -0.9);
    box(castle, 3.6, 0.4, 1.8, '#e5dbc1', 0, 3, -0.5);
    for (let i = -2; i <= 2; i++) box(castle, 0.7, 0.75, 1.55, '#e4dac2', i * 1.15, 4.65, -1.8);
    this.scene.add(castle);
    for (const side of [-1, 1]) {
      const island = new THREE.Group();
      island.position.set(side * 17, -1.5, -66);
      cylinder(island, 8, 6, 4.5, '#a2ad91', 0, -1.4, 0, 9);
      cylinder(island, 7.8, 8, 0.35, '#81a68a', 0, 0.93, 0, 9);
      for (let i = 0; i < 7; i++) {
        const x = Math.sin(i * 7) * 5;
        const z = Math.cos(i * 4) * 5;
        cylinder(island, 0.2, 0.3, 1.7, '#897658', x, 1.6, z, 5);
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3.7, 6), material(i % 2 ? '#5b997f' : '#6baa8b'));
        tree.position.set(x, 3.5, z);
        island.add(tree);
      }
      this.scene.add(island);
    }
    // Far clouds and passing gulls use actual geometry, not image backgrounds.
    for (let i = 0; i < 6; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(2.2, 7, 5), material('#e3f0ec'));
        puff.position.set(j * 2.1, Math.sin(j * 2) * 0.5, 0);
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set((i - 2.5) * 19, 18 + (i % 2) * 3, -90 - i * 3);
      this.scene.add(cloud);
    }
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.45, 0.13, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.45, 0.13, 0),
      ]);
      const gull = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#f3faf8' }));
      gull.position.set((i - 3) * 4.5, 5 + Math.sin(i) * 3, -42 - i * 4);
      this.scene.add(gull);
    }
  }

  private makeBoss(e: Entity, visual: Visual) {
    const group = visual.group;
    const info = bossInfo(e.archetype), bodyType = info.body;
    const tint = info.color, accent = info.accent;
    const armor = new THREE.Color(tint).multiplyScalar(.38).getStyle();
    const glow = (radius: number, x: number, y: number, z: number, color = tint) => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.25) }));
      mesh.position.set(x, y, z); group.add(mesh); return mesh;
    };
    const joint = (x: number, y: number, z: number, action: string, side = 1) => {
      const rig = new THREE.Group(); rig.position.set(x, y, z);
      rig.userData.action = action; rig.userData.side = side;
      group.add(rig); visual.joints!.push(rig); return rig;
    };
    visual.joints = [];
    if (bodyType === 'dragon') {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(.95, 1), material('#623058', .45));
      body.scale.set(1, .8, 1.9); body.position.y = 2.1; body.castShadow = true; group.add(body);
      const head = cylinder(group, .18, .6, 1.7, '#d95242', 0, 2.2, 1.5, 6); head.rotation.x = Math.PI / 2;
      for (const side of [-1, 1]) {
        const wing = joint(side * .45, 2.2, 0, 'wing', side);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, side * 2.7, .5, -1.3, side * 1.7, 0, 1], 3));
        geo.setIndex([0, 1, 2]); geo.computeVertexNormals();
        const membrane = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#a84b69', side: THREE.DoubleSide, roughness: .5 }));
        membrane.castShadow = true; wing.add(membrane);
        const rib = cylinder(wing, .04, .09, 2.9, '#e2a979', side * 1.25, .2, -.5); rib.rotation.z = side * -1.4;
        glow(.1, side * .25, 2.5, 1.85, '#ffdf75');
        const horn = cylinder(group, .01, .15, .8, '#ecd6a6', side * .38, 2.8, 1.1); horn.rotation.z = side * -.4;
        cylinder(group, .16, .25, .75, '#703558', side * .65, .9, .8);
        box(group, .42, .16, .65, '#c18173', side * .65, .5, 1.1);
      }
      const tail = cylinder(group, .05, .42, 2.8, '#623058', 0, 1.6, -2.2); tail.rotation.x = -1.1;
      for (let i = 0; i < 4; i++) cylinder(group, .01, .17, .55, '#e3ba89', 0, 2.9, -.9 + i * .55);
    } else if (bodyType === 'scorpion') {
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), material('#284943', .35));
      shell.position.y = 1.1; shell.scale.set(1.1, .6, 1.35); shell.castShadow = true; group.add(shell);
      box(group, 1.15, .45, .65, '#52795b', 0, 1.25, 1.1);
      for (const side of [-1, 1]) {
        glow(.12, side * .32, 1.5, 1.44);
        for (let i = 0; i < 3; i++) {
          const leg = joint(side * .85, .8, -.75 + i * .7, 'leg', side);
          const limb = cylinder(leg, .11, .18, 1.7, '#547956', side * .7, -.1, .1); limb.rotation.z = side * -1.2;
          const foot = cylinder(leg, .04, .13, .8, '#c5c38e', side * 1.4, -.45, .1); foot.rotation.z = side * -.25;
        }
        const claw = joint(side * 1.2, 1.0, 1.25, 'claw', side);
        const arm = cylinder(claw, .22, .25, 1.15, '#426b52', side * .32, .1, .3); arm.rotation.z = side * -.9;
        const pincer = new THREE.Mesh(new THREE.TorusGeometry(.55, .18, 5, 12, Math.PI * 1.4), material('#91b577', .3));
        pincer.position.set(side * .75, .15, .8); pincer.rotation.x = Math.PI / 2; pincer.rotation.z = side * .65;
        pincer.castShadow = true; claw.add(pincer);
      }
      const tail = joint(0, 1.25, -1.1, 'tail');
      for (let i = 0; i < 5; i++) {
        const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(.33 - i * .025, 0), material('#597d50', .4));
        bead.position.set(0, i * .5, -Math.sin(i * .55) * .8); bead.castShadow = true; tail.add(bead);
      }
      const needle = cylinder(tail, .02, .24, 1.2, '#bcf279', 0, 2.1, .15); needle.rotation.x = .9;
      glow(.17, 0, 3.35, -.8);
    } else if (bodyType === 'necromancer' || bodyType === 'reaper') {
      const reaper = bodyType === 'reaper';
      const robe = reaper ? '#20374b' : '#50346c';
      cylinder(group, .55, 1.05, 2.4, robe, 0, 1.8, 0, 7);
      cylinder(group, .85, .6, .55, reaper ? '#405770' : '#82629d', 0, 3.0, 0, 7);
      const hood = new THREE.Mesh(new THREE.OctahedronGeometry(.85), material(robe));
      hood.position.set(0, 3.65, 0); hood.scale.z = .75; hood.castShadow = true; group.add(hood);
      box(group, .68, .65, .12, '#111b29', 0, 3.6, .52);
      for (const side of [-1, 1]) {
        glow(.09, side * .18, 3.68, .62);
        const arm = cylinder(group, .25, .35, 1.4, robe, side * .95, 2.7, .15); arm.rotation.z = side * .75;
        box(group, .32, .22, .38, '#d8d2bc', side * 1.4, 2.2, .45);
      }
      glow(.2, 0, 2.8, .6);
      const weapon = joint(-1.45, 2.25, .35, reaper ? 'scythe' : 'staff', -1);
      cylinder(weapon, .07, .07, 4.3, '#736585', 0, .15, 0);
      if (reaper) {
        const blade = new THREE.Mesh(new THREE.TorusGeometry(1.2, .14, 4, 16, Math.PI * .9), material('#b6d8df', .25));
        blade.position.set(.7, 2.2, 0); blade.rotation.z = -.2; blade.castShadow = true; weapon.add(blade);
        const point = cylinder(weapon, .01, .2, 1.2, '#83d5e7', 1.85, 2.35, 0); point.rotation.z = -1.3;
      } else {
        const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.38, 1), new THREE.MeshBasicMaterial({ color: '#ce85ff' }));
        orb.position.y = 2.5; weapon.add(orb);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .045, 4, 24), material('#b9a18a', .35));
        ring.position.y = 2.5; ring.rotation.x = .4; weapon.add(ring);
        for (const side of [-1, 1]) {
          const horn = cylinder(group, .01, .12, .75, '#c4a783', side * .6, 4.1, 0); horn.rotation.z = side * -.55;
        }
      }
    } else if (bodyType === 'golem') {
      for (const side of [-1, 1]) {
        box(group, .85, 1.3, .95, '#4c4441', side * .6, .75, 0);
        box(group, 1.1, .18, 1.0, '#f39548', side * .6, 1.3, 0);
        const fist = joint(side * 1.45, 2.7, .15, 'fist', side);
        box(fist, .95, 1.7, 1, '#62534b', 0, -.7, 0);
        box(fist, 1.2, .95, 1.3, '#3c3b3b', 0, -1.55, .1);
        box(fist, 1.22, .13, 1.32, '#ffae5e', 0, -1.4, .1);
        for (let i = 0; i < 2; i++) cylinder(group, .01, .19, .6, '#bdac96', side * (1.2 + i * .3), 3.4, .1);
      }
      box(group, 2.4, 1.65, 1.5, '#5b514a', 0, 2.45, 0);
      box(group, 2.42, .13, 1.53, '#ff8a38', 0, 2.15, 0);
      box(group, 1.05, .95, 1.05, '#716252', 0, 3.8, .05);
      for (const side of [-1, 1]) glow(.12, side * .25, 3.9, .59);
      glow(.34, 0, 2.65, .85);
    } else if (bodyType === 'storm') {
      const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), material('#263c66', .3));
      torso.position.y = 2.3; torso.scale.set(1.0, 1.2, .65); torso.castShadow = true; group.add(torso);
      for (const side of [-1, 1]) {
        box(group, .65, 1.15, .8, '#172945', side * .52, .75, 0);
        const arm = joint(side * 1.05, 2.9, .1, 'fist', side);
        cylinder(arm, .22, .38, 1.6, '#5478a0', 0, -.55, 0, 6);
        glow(.2, side * 1.05, 2.4, .35);
        const crown = cylinder(group, .01, .16, .85, '#dce8aa', side * .4, 4.4, 0, 4); crown.rotation.z = -side * .35;
      }
      box(group, .95, .9, .9, '#3b557f', 0, 3.7, 0);
      glow(.12, -.23, 3.82, .49); glow(.12, .23, 3.82, .49); glow(.3, 0, 2.5, .85);
      const halo = joint(0, 3.0, 0, 'halo');
      for (const radius of [1.2, 1.6]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .035, 4, 24), new THREE.MeshBasicMaterial({ color: tint }));
        ring.rotation.x = radius; halo.add(ring);
      }
      const staff = joint(-1.5, 2.1, .3, 'staff');
      cylinder(staff, .055, .055, 3.7, '#a6c7df', 0, .1, 0);
      for (let i = 0; i < 3; i++) {
        const bolt = box(staff, .18, .8, .12, '#9bdfff', (i - 1) * .25, 2.0, 0); bolt.rotation.z = -.3;
      }
    } else if (bodyType === 'hydra') {
      const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 1), material('#285966', .35));
      body.position.y = 1.3; body.scale.set(1.1, .65, 1.6); body.castShadow = true; group.add(body);
      for (let i = 0; i < 3; i++) {
        const side = i - 1;
        const neck = joint(side * .72, 1.5, .45, 'neck', i + 1);
        for (let j = 0; j < 4; j++) {
          const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(.3, 0), material(i % 2 ? '#459785' : '#407d99', .4));
          bead.position.set(side * j * .1, j * .5, j * .15); bead.castShadow = true; neck.add(bead);
        }
        const head = box(neck, .67, .5, .9, '#b4d7ba', side * .3, 2, .75);
        head.rotation.x = -.15;
        for (const eyeSide of [-1, 1]) {
          const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(.075), new THREE.MeshBasicMaterial({ color: '#8dfff5' }));
          eye.position.set(side * .3 + eyeSide * .23, 2.2, 1.1); neck.add(eye);
        }
        const fang = cylinder(neck, .01, .08, .35, '#f0eecd', side * .3, 1.7, 1.1); fang.rotation.x = Math.PI;
      }
      const tail = joint(0, 1.1, -1, 'tail');
      const taper = cylinder(tail, .04, .38, 2.8, '#3d7880', 0, .1, -1.1); taper.rotation.x = -1.4;
      for (const side of [-1, 1]) box(group, .6, .25, .95, '#284555', side * .95, .6, .2);
    } else if (bodyType === 'void') {
      const eyeRig = joint(0, 2.6, 0, 'eye');
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), material('#382b56', .25));
      shell.scale.z = .6; shell.castShadow = true; eyeRig.add(shell);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.73, 12, 8), material('#dcc6e7', .25));
      eye.position.z = .45; eye.scale.z = .3; eyeRig.add(eye);
      const iris = new THREE.Mesh(new THREE.TorusGeometry(.38, .13, 6, 24), new THREE.MeshBasicMaterial({ color: tint }));
      iris.position.z = .72; eyeRig.add(iris);
      const pupil = box(eyeRig, .12, .55, .08, '#2d123c', 0, 0, .76); pupil.rotation.z = .12;
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4;
        const horn = cylinder(eyeRig, .01, .17, .8, '#705b86', Math.sin(angle) * 1.2, Math.cos(angle) * 1.2, -.2);
        horn.rotation.z = -angle; horn.castShadow = true;
      }
      const halo = joint(0, 2.6, -.4, 'halo');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, .05, 4, 32), new THREE.MeshBasicMaterial({ color: '#bda0fc' }));
      ring.rotation.x = .4; halo.add(ring);
      for (const side of [-1, 1]) {
        const tentacle = cylinder(group, .06, .2, 1.8, '#5a4676', side * .65, 1.0, 0); tentacle.rotation.z = side * .3;
      }
    } else if (bodyType === 'leviathan') {
      const mantle = new THREE.Mesh(new THREE.SphereGeometry(1.25, 10, 7), material('#255766', .35));
      mantle.position.y = 2; mantle.scale.set(.9, 1.2, .8); mantle.castShadow = true; group.add(mantle);
      for (const side of [-1, 1]) { glow(.14, side * .48, 2.35, .82); }
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        const tentacle = joint(Math.sin(angle) * .7, 1.5, Math.cos(angle) * .7, 'tentacle', i + 1);
        const limb = cylinder(tentacle, .12, .28, 2.2, '#439093', Math.sin(angle) * .8, -.35, Math.cos(angle) * .8);
        limb.rotation.z = Math.sin(angle) * -1.1; limb.rotation.x = Math.cos(angle) * 1.1;
        const tip = new THREE.Mesh(new THREE.TorusGeometry(.45, .13, 5, 12, Math.PI * 1.6), material('#71c7ba', .4));
        tip.position.set(Math.sin(angle) * 1.7, -.6, Math.cos(angle) * 1.7); tip.rotation.x = Math.PI / 2;
        tentacle.add(tip);
      }
      const crown = joint(0, 3.3, 0, 'halo');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .06, 4, 24), new THREE.MeshBasicMaterial({ color: '#acfff0' }));
      ring.rotation.x = Math.PI / 2; crown.add(ring);
      glow(.16, 0, 3.55, 0);
    } else if (bodyType === 'spider' || bodyType === 'crab' || bodyType === 'beetle') {
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), material(armor, .3));
      shell.position.set(0, 1.2, -.3); shell.scale.set(bodyType === 'crab' ? 1.5 : 1, .65, 1.4); group.add(shell);
      const legCount = bodyType === 'spider' ? 4 : 3;
      for (const side of [-1, 1]) {
        for (let i = 0; i < legCount; i++) {
          const leg = joint(side * .75, 1, -.95 + i * .65, 'leg', side);
          const upper = cylinder(leg, .08, .15, 1.5, tint, side * .65, .25, 0, 5); upper.rotation.z = -side * 1.2;
          const lower = cylinder(leg, .035, .1, 1.1, armor, side * 1.3, -.35, .12, 5); lower.rotation.z = side * .4;
        }
        const claw = joint(side * .8, 1, 1, 'claw', side);
        if (bodyType === 'crab') {
          box(claw, .75, .5, 1, tint, side * .65, .15, .35);
          for (const offset of [-1, 1]) {
            const finger = cylinder(claw, .02, .18, .9, accent, side * .65 + offset * .2, .2, 1); finger.rotation.x = 1.2;
          }
        } else {
          const fang = cylinder(claw, .015, .17, .9, accent, side * .28, .1, .55); fang.rotation.x = 1.8;
        }
        glow(.13, side * .26, 1.65, 1.05, accent);
      }
      if (bodyType === 'spider') {
        cylinder(group, .4, .65, 1.5, tint, 0, 2, .1);
        glow(.3, 0, 2.95, .2, accent);
        for (const side of [-1, 1]) { const arm = cylinder(group, .06, .18, 1.2, accent, side * .6, 2.25, .1); arm.rotation.z = side; }
      } else if (bodyType === 'beetle') {
        const horn = cylinder(group, .02, .22, 2.1, accent, 0, 2, 1.1); horn.rotation.x = -.6;
        for (const side of [-1, 1]) {
          const wing = joint(side * .7, 1.45, -.2, 'wing', side);
          const plate = box(wing, .9, .13, 2.2, tint, side * .5, .3, -.4); plate.rotation.z = side * .25;
        }
      } else for (let i = 0; i < 5; i++) cylinder(group, .02, .12, .6 + i % 2 * .4, accent, (i - 2) * .4, 2, -.35, 5);
    } else if (bodyType === 'manta' || bodyType === 'phoenix' || bodyType === 'seraph') {
      cylinder(group, .35, .55, 1.7, armor, 0, 2.45, 0, 6);
      glow(.35, 0, 3.5, .2, accent); glow(.22, 0, 2.6, .6);
      const tiers = bodyType === 'seraph' ? 3 : 1;
      for (const side of [-1, 1]) for (let tier = 0; tier < tiers; tier++) {
        const wing = joint(side * .4, 2.8 - tier * .5, -.1, 'wing', side);
        for (let i = 0; i < 4; i++) {
          const feather = new THREE.Mesh(new THREE.OctahedronGeometry(1), material(i % 2 ? accent : tint, .35));
          feather.position.set(side * (1 + i * .43), .2 - tier * .3, -.25 - i * .23);
          feather.scale.set(.35, .13, bodyType === 'manta' ? 1.5 : .9 + i * .15); feather.rotation.y = side * -.5;
          wing.add(feather);
        }
      }
      const tail = joint(0, 2, -.35, 'tail');
      for (let i = 0; i < 3; i++) {
        const ribbon = cylinder(tail, .01, .1, 2.4 + i * .2, i % 2 ? tint : accent, (i - 1) * .3, -.35, -1);
        ribbon.rotation.x = -.65;
      }
      const halo = joint(0, 3.8, -.1, 'halo');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.7, .055, 4, 24), new THREE.MeshBasicMaterial({ color: accent }));
      halo.add(ring);
    } else if (bodyType === 'serpent') {
      for (let i = 0; i < 8; i++) {
        const neck = joint(Math.sin(i * .75) * .65, .7 + i * .25, -.9 + i * .3, 'neck', i + 1);
        const scale = new THREE.Mesh(new THREE.IcosahedronGeometry(.6 - i * .025, 1), material(i % 2 ? armor : tint, .4));
        scale.scale.set(1, .8, 1.2); neck.add(scale);
        cylinder(neck, .01, .1, .45, accent, 0, .55, -.05);
      }
      box(group, 1.1, .6, 1.3, armor, -.35, 3, 1.3);
      for (const side of [-1, 1]) {
        glow(.13, -.35 + side * .33, 3.25, 1.95, accent);
        const fang = cylinder(group, .01, .09, .6, accent, -.35 + side * .35, 2.7, 1.95); fang.rotation.x = Math.PI;
      }
    } else if (bodyType === 'centaur' || bodyType === 'sentinel' || bodyType === 'titan') {
      const centaur = bodyType === 'centaur';
      if (centaur) box(group, 1.2, .85, 2.1, armor, 0, 1.1, -.45);
      for (const side of [-1, 1]) {
        for (let i = 0; i < (centaur ? 2 : 1); i++) {
          const leg = joint(side * .6, 1.1, centaur ? -.9 + i * 1.4 : 0, 'leg', side);
          box(leg, .45, 1, .55, tint, 0, -.35, 0); box(leg, .6, .23, .75, armor, 0, -.95, .15);
        }
        const arm = joint(side * 1.1, 2.85, .2, 'fist', side);
        box(arm, .65, 1.35, .75, tint, 0, -.5, 0);
        box(arm, .9, .45, .95, armor, 0, .15, 0);
        if (bodyType === 'sentinel') {
          const barrel = cylinder(arm, .19, .19, 1.5, accent, 0, -.8, .5); barrel.rotation.x = Math.PI / 2;
        }
      }
      box(group, 1.8, 1.4, 1, armor, 0, 2.6, 0);
      box(group, .95, .85, .9, tint, 0, 3.75, .15);
      box(group, .72, .12, .06, accent, 0, 3.87, .64);
      glow(.3, 0, 2.7, .6);
      if (centaur) {
        const lance = joint(-1.6, 2.5, .4, 'staff', -1);
        cylinder(lance, .06, .06, 4, accent, 0, .2, 0); cylinder(lance, .01, .25, .9, tint, 0, 2.45, 0);
      } else {
        const halo = joint(0, 3, -.7, 'halo');
        const ring = new THREE.Mesh(new THREE.TorusGeometry(bodyType === 'titan' ? 1.65 : 1.2, .07, 4, 24), new THREE.MeshBasicMaterial({ color: accent }));
        halo.add(ring);
      }
    } else {
      const boss = new THREE.Mesh(soldierGeometry('red', false, 'brute'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, flatShading: true }));
      boss.scale.setScalar(3.6); boss.rotation.y = Math.PI; boss.castShadow = true; group.add(boss);
      const hammer = joint(-1.65, 2.2, .6, 'hammer', -1);
      cylinder(hammer, .09, .09, 3.4, '#70503f', 0, -.55, 0);
      box(hammer, 1.5, .9, 1, '#434b62', 0, 1.0, 0);
      box(hammer, 1.52, .14, 1.02, '#f08860', 0, 1.0, 0);
      for (const side of [-1, 1]) glow(.1, side * .23, 2.95, .7);
    }
    // Variants change armor hue, crown geometry, satellite arrangement and silhouette.
    if (info.variant > 0) {
      for (const part of [...group.children, ...visual.joints!]) for (const child of part.children) {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial && !child.material.vertexColors) {
          child.material = material(new THREE.Color(child.material.color).lerp(new THREE.Color(tint), .55).getStyle(), .4);
        }
      }
      const crown = joint(0, 3.2, 0, 'halo');
      for (let i = 0; i < 3 + info.variant * 2; i++) {
        const angle = i * Math.PI * 2 / (3 + info.variant * 2);
        const spike = cylinder(crown, .01, .12, .6 + info.variant * .18, accent, Math.sin(angle) * .85, .4, Math.cos(angle) * .85, 5);
        spike.rotation.z = -Math.sin(angle) * .45;
      }
      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.OctahedronGeometry(.8), material(tint, .3));
        fin.position.set(side * (1.1 + info.variant * .18), 2.75, -.4); fin.scale.set(.55, info.variant === 2 ? 1.2 : .55, .6);
        group.add(fin);
      }
    }
    group.scale.setScalar(info.scale);
    mergeBossParts(group);
    const aura = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.66, 48), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: .45, side: THREE.DoubleSide }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = .04; group.add(aura);
  }

  private makeVisual(e: Entity) {
    const group = new THREE.Group();
    const visual: Visual = { group, textures: [] };
    if (e.kind === 'gate') {
      const tint = gateColor(e);
      for (const x of [-1.85, 1.85]) {
        cylinder(group, 0.045, 0.06, 1.9, '#e9ddaf', x, 0.95, 0, 6);
        const cap = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), material(colors.gold, 0.4));
        cap.position.set(x, 1.93, 0);
        group.add(cap);
        box(group, 0.28, 0.14, 0.4, tint, x, 0.07, 0);
      }
      const str = gateText(e);
      const texture = textTexture(str, tint);
      visual.textures.push(texture);
      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 1.65),
        new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.7, emissive: tint, emissiveIntensity: 0.13 }),
      );
      banner.position.y = 1.03;
      group.add(banner);
      visual.banner = banner; visual.locked = e.locked; visual.hp = str; visual.labelTime = this.animationTime;
      box(group, 3.72, 0.09, 0.11, '#f3dfb0', 0, 1.87, 0);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.1), new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.04;
      group.add(floor);
      visual.floor = floor;
    } else if (e.kind === 'barrel') {
      cylinder(group, 0.62, 0.62, 1.25, '#a97939', 0, 0.65, 0, 10);
      for (const y of [0.21, 0.98]) cylinder(group, 0.64, 0.64, 0.13, '#d0b16a', 0, y, 0, 10);
      const weapon = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.07, 5, 10, Math.PI), material(colors.gold));
      weapon.position.set(0, 1.55, 0);
      weapon.rotation.z = Math.PI;
      group.add(weapon);
      box(group, 0.6, 0.07, 0.08, colors.gold, 0, 1.55, 0);
    } else if (e.kind === 'boss') {
      this.makeBoss(e, visual);
    }
    this.scene.add(group);
    this.visuals.set(e.id, visual);
    return visual;
  }

  beat(strength: number) { this.pulse = Math.max(this.pulse, strength); }

  emit(event: GameEvent) {
    const weaponIndex = event.weapon ?? 0, weapon = WEAPONS[weaponIndex];
    if (event.type === 'shot') {
      this.recoil = .07 + weaponIndex * .0015;
      this.playerBurst(event, 'shot');
    } else if (event.type === 'hit' && this.animationTime - this.lastHitBurst >= .035) {
      this.lastHitBurst = this.animationTime; this.playerBurst(event, 'hit');
    }
    if (event.type === 'fever') {
      this.playerBurst(event, 'ultimate');
      this.shake = Math.max(this.shake, .11);
      this.pulse = 1;
    }
    if (event.type === 'bossAttack' || event.type === 'bossImpact') {
      const cast = event.type === 'bossAttack';
      const colorKey = event.color ?? '#ff9060';
      if (!this.effectColors.has(colorKey)) this.effectColors.set(colorKey, new THREE.Color(colorKey));
      const effect = this.battlePool.pop() ?? {} as BattleEffect;
      effect.cast = cast; effect.style = event.style ?? 'slam';
      effect.recipe = effectRecipes.get(event.effectId ?? '') ?? BOSS_EFFECTS[0];
      effect.x = cast ? event.x ?? 0 : event.toX ?? 0;
      effect.z = cast ? event.z ?? -16 : event.toZ ?? -16;
      effect.toX = cast ? event.toX ?? 0 : event.x ?? 0;
      effect.toZ = cast ? event.toZ ?? 0 : event.z ?? 0;
      effect.max = cast ? event.value ?? .9 : effect.recipe.duration;
      effect.life = effect.max; effect.radius = event.radius ?? .9; effect.source = event.source;
      effect.color = this.effectColors.get(colorKey)!; this.battleEffects.push(effect);
      if (this.battleEffects.length > 32) this.battlePool.push(...this.battleEffects.splice(0, this.battleEffects.length - 32));
      if (cast) return;
    }
    if (event.type === 'chain') {
      const chain = this.chains.find(c => c.life <= 0) ?? this.chains[0];
      const attribute = chain.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i <= 7; i++) {
        const t = i / 7;
        attribute.setXYZ(i,
          (event.x ?? 0) * (1 - t) + (event.toX ?? 0) * t + (i % 2 ? 0.2 : -0.2),
          1.1 + Math.random() * 0.25, (event.z ?? 0) * (1 - t) + (event.toZ ?? 0) * t,
        );
      }
      (chain.line.material as THREE.LineBasicMaterial).color.set(weapon.accent);
      attribute.needsUpdate = true; chain.life = .16; chain.line.visible = true; return;
    }
    if (!['gate', 'kill', 'hurt', 'hit', 'shot', 'fever', 'upgrade', 'bossImpact'].includes(event.type)) return;
    const tint = event.color ?? (event.type === 'hurt' ? '#ff3e60' : event.type === 'gate' ? '#54ecff' : WEAPONS[event.weapon ?? 0].color);
    if (!this.effectColors.has(tint)) this.effectColors.set(tint, new THREE.Color(tint).multiplyScalar(1.15));
    const count = event.type === 'shot' ? 1 + Math.floor(weaponIndex / 7) : event.type === 'hit' ? 1 : event.type === 'bossImpact' ? (effectRecipes.get(event.effectId ?? '')?.particles ?? 24) : event.boss ? 65 : event.type === 'kill' ? 18 : 22;
    if (event.type === 'hurt') this.shake = 0.20;
    else if (event.boss) this.shake = event.type === 'bossImpact' ? .09 : .26;
    else if (event.type === 'kill') this.shake = Math.max(this.shake, 0.035);
    else if (event.type === 'shot' && (event.weapon ?? 0) >= 3) this.shake = Math.max(this.shake, 0.022);
    for (let i = 0; i < count; i++) {
      const big = event.boss ? 2 : 1;
      const particle = this.particlePool.pop() ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: .7, color: this.effectColors.get(tint)! };
      const shot = event.type === 'shot';
      particle.x = (event.x ?? 0) + (Math.random() - .5) * (shot ? .4 : big); particle.y = shot ? .75 : .6 + Math.random(); particle.z = shot ? -.65 : event.z ?? 0;
      particle.vx = (Math.random() - .5) * (shot ? 1.5 : 8 * big); particle.vy = shot ? .3 : 2 + Math.random() * 5;
      particle.vz = shot ? -9 : (Math.random() - .5) * 8 * big;
      particle.life = particle.max = shot ? .1 : .24 + Math.random() * .35; particle.color = this.effectColors.get(tint)!;
      this.particles.push(particle);
    }
    if (this.particles.length > 420) this.particlePool.push(...this.particles.splice(0, this.particles.length - 420));
    if (event.type === 'kill' || event.type === 'fever' || event.type === 'bossImpact') {
      const wave = this.waves.find(w => w.life <= 0) ?? this.waves[0];
      wave.max = event.boss ? 0.8 : 0.4; wave.life = wave.max;
      wave.mesh.position.set(event.x ?? 0, 0.10, event.z ?? 0);
      wave.mesh.userData.radius = event.type === 'bossImpact' ? (event.radius ?? .9) * 2.2 : event.boss ? 7 : event.type === 'fever' ? 4 : 2.1;
      (wave.mesh.material as THREE.MeshBasicMaterial).color.set(tint);
    }
  }

  private playerBurst(event: GameEvent, kind: PlayerBurst['kind']) {
    const burst = this.burstPool.pop() ?? {} as PlayerBurst;
    burst.weapon = event.weapon ?? 0; burst.kind = kind;
    burst.x = event.x ?? 0; burst.z = kind === 'shot' ? -.75 : event.z ?? 0;
    burst.max = kind === 'shot' ? .11 : kind === 'hit' ? .23 + burst.weapon * .003 : 1.15;
    burst.life = burst.max; this.playerBursts.push(burst);
    if (this.playerBursts.length > 24) this.burstPool.push(...this.playerBursts.splice(0, this.playerBursts.length - 24));
  }

  private updateRig(index: number) {
    if (index === this.rigIndex) return;
    this.rigIndex = index;
    for (const child of [...this.weaponRig.children]) {
      child.traverse(obj => { if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        if (obj.material instanceof THREE.MeshBasicMaterial) obj.material.dispose();
      } });
      this.weaponRig.remove(child);
    }
    const weapon = WEAPONS[index], tint = weapon.color, stage = Math.floor(index / 5);
    for (const side of [-1, 1]) {
      const body = cylinder(this.weaponRig, .075 + stage * .016, .12 + stage * .016, .65 + stage * .08, '#344556', side * .36, .62, -.3, 8);
      body.rotation.x = Math.PI / 2;
      box(this.weaponRig, .14, .08, .27, '#bad6df', side * .36, .75, -.2);
      for (let i = 0; i <= stage; i++) {
        const collar = cylinder(this.weaponRig, .125 + stage * .016, .125 + stage * .016, .045, '#7fa4b6', side * .36, .62, -.4 - i * .09, 8);
        collar.rotation.x = Math.PI / 2;
      }
    }
    if (stage >= 2) for (const side of [-1, 1]) box(this.weaponRig, .1, .28, .35, '#496b86', side * .53, .73, -.15);
    mergeBossParts(this.weaponRig);
    const glowMaterial = new THREE.MeshBasicMaterial({ color: tint });
    for (const side of [-1, 1]) {
      const muzzle = new THREE.Mesh(new THREE.TorusGeometry(.09 + stage * .016, .018, 4, 12), glowMaterial);
      muzzle.position.set(side * .36, .62, -.65 - stage * .04); this.weaponRig.add(muzzle);
    }
    const core = new THREE.Mesh(projectileGeometry(weapon), new THREE.MeshBasicMaterial({ vertexColors: true }));
    core.scale.setScalar(.38); core.position.set(0, .85, -.3); core.userData.orbit = true;
    this.weaponRig.add(core);
  }
  private renderBattleEffects(engine: Engine, dt: number, time: number) {
    let beamCount = 0, columnCount = 0, sigilCount = 0, slashCount = 0, live = 0;
    const beam = (x: number, y: number, z: number, tx: number, ty: number, tz: number, width: number, color: THREE.Color) => {
      if (beamCount >= 64) return;
      this.effectDirection.set(tx - x, ty - y, tz - z);
      const length = this.effectDirection.length();
      if (length < .01) return;
      this.dummy.position.set((x + tx) / 2, (y + ty) / 2, (z + tz) / 2);
      this.dummy.quaternion.setFromUnitVectors(this.axisY, this.effectDirection.multiplyScalar(1 / length));
      this.dummy.scale.set(width, length, width); this.dummy.updateMatrix();
      this.beams.setMatrixAt(beamCount, this.dummy.matrix); this.beams.setColorAt(beamCount++, color);
    };
    for (const effect of this.battleEffects) {
      if (engine.status !== 'paused') effect.life -= dt;
      if (engine.status === 'ready' || effect.life <= 0 || (effect.cast && effect.source && !this.entityIndex.get(effect.source)?.active)) {
        this.battlePool.push(effect); continue;
      }
      this.battleEffects[live++] = effect;
      const progress = 1 - effect.life / effect.max, fade = effect.life / effect.max;
      const recipe = effect.recipe, variation = recipe.variation;
      const spin = progress * recipe.twist * Math.PI * 2;
      const width = effect.cast ? .016 + progress * .025 : recipe.width * (1 + Math.sin(progress * Math.PI)) * fade;
      const ring = (x: number, y: number, z: number, radius: number, tilt: number, rotation: number) => {
        if (sigilCount >= 64) return;
        this.dummy.position.set(x, y, z); this.dummy.rotation.set(tilt, 0, rotation);
        this.dummy.scale.setScalar(radius); this.dummy.updateMatrix();
        this.sigils.setMatrixAt(sigilCount, this.dummy.matrix); this.sigils.setColorAt(sigilCount++, effect.color);
      };
      const spike = (x: number, z: number, height: number, radius: number, tilt = 0) => {
        if (columnCount >= 64) return;
        this.dummy.position.set(x, height / 2 + .1, z); this.dummy.rotation.set(tilt, spin, tilt * .4);
        this.dummy.scale.set(radius, Math.max(.05, height), radius); this.dummy.updateMatrix();
        this.columns.setMatrixAt(columnCount, this.dummy.matrix); this.columns.setColorAt(columnCount++, effect.color);
      };
      const arc = (x: number, y: number, z: number, radius: number, tilt: number, rotation: number) => {
        if (slashCount >= 64) return;
        this.dummy.position.set(x, y, z); this.dummy.rotation.set(tilt, variation * .1, rotation);
        this.dummy.scale.setScalar(radius); this.dummy.updateMatrix();
        this.slashes.setMatrixAt(slashCount, this.dummy.matrix); this.slashes.setColorAt(slashCount++, effect.color);
      };
      if (effect.cast) {
        for (let i = 0; i < recipe.rings; i++) {
          ring(effect.x, 2.6 + i * .18, effect.z, (.35 + progress * .5) * (1 + i * .3), -.35 + i * .3, spin + i);
        }
        for (let i = 0; i < recipe.spokes; i++) {
          const angle = i * Math.PI * 2 / recipe.spokes + spin, radius = .55 + progress * .3;
          beam(effect.x + Math.cos(angle) * radius, 2.8 + Math.sin(angle) * radius, effect.z,
            effect.x + Math.cos(angle) * radius * 1.45, 2.8 + Math.sin(angle) * radius * 1.45, effect.z, width, effect.color);
        }
        beam(effect.x, 2.6, effect.z, effect.toX, .15, effect.toZ, width * .6, effect.color);
        continue;
      }
      const x = effect.toX, z = effect.toZ;
      const reach = effect.radius * recipe.reach * (1 + progress * 2.2);
      const height = (3.5 + variation * .12) * Math.sin(Math.min(1, progress * 3) * Math.PI / 2) * fade;
      for (let i = 0; i < recipe.rings; i++) ring(x, .12 + i * .02, z, reach * (1 + i * .3), -Math.PI / 2, spin + i);
      switch (effect.style) {
        case 'slam':
          spike(x, z, height * .7, .3 * fade);
          for (let i = 0; i < recipe.spokes; i++) {
            const angle = i * Math.PI * 2 / recipe.spokes + variation * .2;
            beam(x, .15, z, x + Math.cos(angle) * reach * 1.5, .16, z + Math.sin(angle) * reach * 1.5, width, effect.color);
          }
          break;
        case 'lightning':
          for (let i = 0; i < recipe.spokes; i++) {
            const offset = (i - (recipe.spokes - 1) / 2) * .38;
            const midX = x + offset + Math.sin(time * 57 + i) * .3;
            beam(x + offset, 5 + i * .3, z, midX, 2.3, z + .2, width, effect.color);
            beam(midX, 2.3, z + .2, x + offset * .5, .15, z, width, effect.color);
          }
          break;
        case 'flame':
          beam(effect.x, 2.7, effect.z, x, .25, z, width * 1.6, effect.color);
          for (let i = 0; i < recipe.spokes; i++) {
            const angle = i * Math.PI * 2 / recipe.spokes + spin;
            spike(x + Math.cos(angle) * reach * .35, z + Math.sin(angle) * reach * .35, height * (.65 + i % 2 * .25), .26 * fade, .2);
          }
          break;
        case 'venom':
          for (let i = 0; i < recipe.spokes; i++) {
            const angle = i * Math.PI * 2 / recipe.spokes + spin;
            spike(x + Math.cos(angle) * reach * .7, z + Math.sin(angle) * reach * .7, height * .35, .25 * fade, Math.cos(angle) * .35);
            ring(x + Math.cos(angle) * reach, .13, z + Math.sin(angle) * reach, .3 * fade, -Math.PI / 2, angle);
          }
          break;
        case 'ice':
          for (let i = 0; i < recipe.spokes; i++) {
            const angle = i * Math.PI * 2 / recipe.spokes + variation * .18;
            spike(x + Math.cos(angle) * reach * .5, z + Math.sin(angle) * reach * .5, height * (.7 + i % 3 * .2), .17 * fade, Math.cos(angle) * .35);
          }
          break;
        case 'rune':
          for (let i = 0; i < recipe.spokes; i++) {
            const angle = i * Math.PI * 2 / recipe.spokes + spin;
            const next = angle + Math.PI * 2 / recipe.spokes;
            beam(x + Math.cos(angle) * reach, .3, z + Math.sin(angle) * reach,
              x + Math.cos(next) * reach, .3, z + Math.sin(next) * reach, width, effect.color);
            ring(x, .4 + i * .35, z, reach * .7, variation % 2 ? -.9 : -Math.PI / 2, spin + i * .5);
          }
          break;
        case 'eruption':
          for (let i = 0; i < recipe.spokes; i++) spike(x + (i - (recipe.spokes - 1) / 2) * .45, z + Math.sin(i + variation) * .4, height * (1 - Math.abs(i - recipe.spokes / 2) * .1), .33 * fade);
          break;
        case 'blade':
          for (let i = 0; i < recipe.rings + 1; i++) arc(x, .6 + i * .4, z, reach * (.7 + i * .25), -.5 + i * .65, spin + i * Math.PI / 2);
          beam(effect.x, 2.7, effect.z, x, .2, z, width * .7, effect.color);
          break;
        case 'void':
          for (let i = 0; i < recipe.rings + 1; i++) ring(x, .8 + i * .22, z, reach * fade * (1 + i * .25), i * .65, -spin);
          for (let i = 0; i < recipe.spokes; i++) {
            const angle = i * Math.PI * 2 / recipe.spokes + spin;
            beam(x + Math.cos(angle) * reach, .8 + Math.sin(angle) * reach, z, x, 1, z, width, effect.color);
          }
          beam(effect.x, 2.7, effect.z, x, 1, z, width * 1.8, effect.color);
          break;
        case 'tide':
          for (let i = 0; i < recipe.rings + 1; i++) arc(x, .3 + i * .2, z - progress * (2 + i) * recipe.reach, reach * (1 + i * .25), -.8, Math.PI / 2 + variation * .1);
          for (let i = 0; i < recipe.spokes; i++) spike(x + (i - (recipe.spokes - 1) / 2) * .4, z - progress * 2, height * .35, .15 * fade);
      }
    }
    this.battleEffects.length = live;
    // Share existing batches; Boss telegraphs get the first claim on every budget.
    let liveBursts = 0;
    for (const burst of this.playerBursts) {
      if (engine.status !== 'paused') burst.life -= dt;
      if (engine.status === 'ready' || burst.life <= 0) { this.burstPool.push(burst); continue; }
      this.playerBursts[liveBursts++] = burst;
      const weapon = WEAPONS[burst.weapon], v = weapon.visual;
      const fade = burst.life / burst.max, progress = 1 - fade, ultimate = burst.kind === 'ultimate';
      const muzzle = burst.kind === 'shot', size = muzzle ? .15 : ultimate ? .55 + progress * 3.8 : .2 + progress * (.45 + burst.weapon * .02);
      const spokes = muzzle ? 2 + burst.weapon % 3 : ultimate ? v.spokes + 3 : v.spokes;
      this.tint.copy(this.weaponColors[burst.weapon]).multiplyScalar(.35 + fade * .65);
      const x = ultimate ? engine.x : burst.x, z = burst.z;
      for (let i = 0; i < spokes; i++) {
        const angle = i * Math.PI * 2 / spokes + progress * v.spin + burst.weapon * .17;
        const reach = size * (i % 2 ? 1 : 1.3);
        beam(x + Math.cos(angle) * size * .25, .8, z + Math.sin(angle) * size * .25,
          x + Math.cos(angle) * reach, .8 + (ultimate ? .4 * Math.sin(angle) : 0), z + Math.sin(angle) * reach,
          (muzzle ? .018 : ultimate ? .035 : .025) * fade, this.tint);
      }
      if (!muzzle && (burst.weapon >= 4 || ultimate)) {
        for (let i = 0; i < (ultimate ? v.rings + 1 : Math.min(2, v.rings)); i++) {
          if (sigilCount >= 64) break;
          this.dummy.position.set(x, .2 + i * .2, z);
          this.dummy.rotation.set(-Math.PI / 2 + (burst.weapon % 3) * .17, 0, progress * v.spin + i);
          this.dummy.scale.setScalar(size * (1 + i * .25)); this.dummy.updateMatrix();
          this.sigils.setMatrixAt(sigilCount, this.dummy.matrix); this.sigils.setColorAt(sigilCount++, this.tint);
        }
      }
      if (!muzzle && ['blades', 'disc', 'cross', 'rainbow', 'crescent', 'singularity'].includes(weapon.id)) {
        for (let i = 0; i < (ultimate ? 3 : 1) && slashCount < 64; i++) {
          this.dummy.position.set(x, .65 + i * .25, z);
          this.dummy.rotation.set(-.8 + i * .6, progress * v.spin, burst.weapon * .2 + i);
          this.dummy.scale.setScalar(size * fade); this.dummy.updateMatrix();
          this.slashes.setMatrixAt(slashCount, this.dummy.matrix); this.slashes.setColorAt(slashCount++, this.tint);
        }
      }
      if (!muzzle && (weapon.burn || weapon.slow) && columnCount < 64) {
        this.dummy.position.set(x, .5 * fade, z); this.dummy.rotation.set(.2, progress * v.spin, 0);
        this.dummy.scale.set(.15 * fade, (ultimate ? 3 : .8) * fade, .15 * fade); this.dummy.updateMatrix();
        this.columns.setMatrixAt(columnCount, this.dummy.matrix); this.columns.setColorAt(columnCount++, this.tint);
      }
    }
    this.playerBursts.length = liveBursts;
    if (engine.fever > 0 && sigilCount < 64) {
      this.dummy.position.set(engine.x, .1, .2); this.dummy.rotation.set(-Math.PI / 2, 0, time * .8);
      this.dummy.scale.setScalar(1.15 + Math.sin(time * 5) * .04); this.dummy.updateMatrix();
      this.sigils.setMatrixAt(sigilCount, this.dummy.matrix); this.sigils.setColorAt(sigilCount++, this.weaponColors[engine.weapon]);
    }
    for (const [mesh, count] of [[this.beams, beamCount], [this.columns, columnCount], [this.sigils, sigilCount], [this.slashes, slashCount]] as const) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  project(x: number, y: number, z: number) {
    const vector = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: (vector.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-vector.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }
  get formationState() {
    let left = this.project(this.hero.position.x - 0.6, 0, this.hero.position.z).x;
    let right = this.project(this.hero.position.x + 0.6, 0, this.hero.position.z).x;
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < this.blue.count; i++) {
      this.blue.getMatrixAt(i, matrix);
      const x = matrix.elements[12], z = matrix.elements[14];
      left = Math.min(left, this.project(x - 0.4, 0, z).x);
      right = Math.max(right, this.project(x + 0.4, 0, z).x);
    }
    return { roadZ: this.road.position.z, heroZ: this.hero.position.z,
      baseline: this.project(this.hero.position.x, 0, this.hero.position.z).y / this.container.clientHeight,
      left: left / this.container.clientWidth, right: right / this.container.clientWidth };
  }
  get performanceState() {
    return { fps: Math.round(1000 / this.frameMs), frameMs: Number(this.frameMs.toFixed(2)),
      renderMs: Number(this.renderMs.toFixed(2)), pixelRatio: this.pixelRatio,
      bloom: this.bloom.enabled, labelUpdates: this.labelUpdates, attackEffects: this.battleEffects.length,
      playerEffects: this.playerBursts.length, particles: this.particles.length };
  }

  render(engine: Engine, delta: number) {
    const renderStart = performance.now();
    const dt = Math.min(delta, 0.1);
    const active = engine.status === 'playing';
    if (active) {
      this.frameMs += (Math.min(delta * 1000, 100) - this.frameMs) * .035;
      this.qualityTimer += dt;
      if (this.qualityTimer > 3) {
        this.qualityTimer = 0;
        // Lower resolution only after sustained pressure; never oscillate mid-fight.
        if (this.frameMs > 25 && this.pixelRatio > .85) {
          this.pixelRatio = Math.max(.85, Number((this.pixelRatio - .2).toFixed(2)));
          this.renderer.setPixelRatio(this.pixelRatio); this.composer.setPixelRatio(this.pixelRatio); this.resize();
        } else if (this.frameMs > 34 && this.pixelRatio <= .85) this.bloom.enabled = false;
      }
    }
    if (engine.status !== 'paused') this.animationTime += dt;
    const time = this.animationTime;
    this.shake = Math.max(0, this.shake - dt * 0.8);
    this.pulse = Math.max(0, this.pulse - dt * 5);
    const shake = this.reducedMotion ? 0 : this.shake;
    this.camera.position.set((Math.random() - 0.5) * shake, this.cameraY + Math.sin(time * 60) * shake, this.cameraZ);
    this.camera.lookAt(0, 0, this.cameraTargetZ);
    this.bloom.strength = 0.34 + (engine.fever > 0 ? 0.12 : 0) + this.pulse * 0.06;
    this.seaMaterial.uniforms.time.value = time;
    this.road.position.z = 0;
    const biome = Math.floor(engine.elapsed / 40) % 4;
    if (biome !== this.biome) {
      this.biome = biome;
      const palettes = [
        { sky: '#95c9d6', sea: [0.06, 0.36, 0.47], tile: '#d8c8a4' },
        { sky: '#4b5178', sea: [0.035, 0.11, 0.22], tile: '#8d8a9f' },
        { sky: '#634256', sea: [0.42, 0.075, 0.018], tile: '#987f82' },
        { sky: '#a8bbd4', sea: [0.13, 0.25, 0.40], tile: '#d3e0ed' },
      ];
      const p = palettes[biome];
      (this.scene.background as THREE.Color).set(p.sky); (this.scene.fog as THREE.Fog).color.set(p.sky);
      this.seaMaterial.uniforms.tint.value.set(...p.sea);
      if (this.tiles) {
        const base = new THREE.Color(p.tile);
        for (let i = 0; i < this.tiles.count; i++) this.tiles.setColorAt(i, base.clone().multiplyScalar(0.94 + (i % 5) * 0.03));
        this.tiles.instanceColor!.needsUpdate = true;
      }
    }
    const count = Math.min(150, Math.max(0, engine.troops - 1));
    this.blue.count = count;
    const cols = Math.max(2, Math.min(10, Math.ceil(Math.sqrt(count))));
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      this.dummy.position.set(
        engine.x + (col - (Math.min(cols, count - row * cols) - 1) / 2) * 0.36,
        0,
        0.55 + row * 0.14,
      );
      this.dummy.rotation.set(0, (engine.targetX - engine.x) * -0.08, 0);
      this.dummy.scale.setScalar(count > 80 ? 0.7 : 0.84);
      this.dummy.updateMatrix();
      this.blue.setMatrixAt(i, this.dummy.matrix);
    }
    this.blue.instanceMatrix.needsUpdate = true;
    this.hero.visible = engine.troops > 0;
    this.hero.position.set(engine.x, 0, 0.1);
    this.hero.rotation.y = (engine.targetX - engine.x) * -0.12;
    this.hero.scale.setScalar(1.12);
    this.updateRig(engine.weapon);
    if (engine.status !== 'paused') this.recoil = Math.max(0, this.recoil - dt * .7);
    this.weaponRig.scale.setScalar(1 + Math.log2(1 + engine.gearLevel) * 0.08);
    this.weaponRig.position.copy(this.hero.position); this.weaponRig.rotation.y = this.hero.rotation.y;
    this.weaponRig.position.z += this.recoil;
    this.weaponRig.rotation.x = -this.recoil * .4;
    for (const child of this.weaponRig.children) if (child.userData.orbit) child.rotation.y = time * WEAPONS[engine.weapon].visual.spin * .35;
    this.weaponRig.visible = this.hero.visible;
    this.armyRing.position.x = engine.x;
    this.armyRing.scale.setScalar(Math.max(0.75, Math.sqrt(count) * 0.24) * (1 + this.pulse * 0.045));
    (this.armyRing.material as THREE.MeshBasicMaterial).color.set(engine.fever > 0 ? '#ffb33f' : engine.weaponInfo.color);
    this.armyRing.visible = engine.troops > 0;
    const boss = engine.boss;
    this.weakPoint.visible = !!boss && active && boss.z >= -ATTACK_RANGE;
    if (boss) {
      this.weakPoint.position.set(boss.x, bossInfo(boss.archetype).body === 'dragon' ? 2.6 : 3, boss.z + 1);
      this.weakPoint.rotation.set(-0.2, 0, time * 2);
      this.weakPoint.scale.setScalar(0.85 + boss.focus * 0.3 + this.pulse * 0.05);
      const aligned = Math.abs(engine.x - boss.x) <= BOSS_AIM_RADIUS;
      (this.weakPoint.material as THREE.MeshBasicMaterial).color.set(aligned && boss.focus > 0.85 ? '#54ffb2' : '#ffde72');
    }
    const enemyCounts = new Map<EnemyType, number>();
    this.entityIndex.clear();
    for (const e of engine.entities) this.entityIndex.set(e.id, e);
    for (const [id, visual] of this.visuals) {
      const entity = this.entityIndex.get(id);
      if (!entity?.active || entity.z > 6) {
        this.scene.remove(visual.group);
        for (const texture of visual.textures) texture.dispose();
        visual.group.traverse(obj => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry.dispose();
            if (!Array.isArray(obj.material) && !sharedMaterials.has(obj.material)) obj.material.dispose();
          }
          if (obj instanceof THREE.Sprite) obj.material.dispose();
        });
        this.visuals.delete(id);
      }
    }
    for (const e of engine.entities) {
      if (!e.active || e.z < -ATTACK_RANGE || e.z > 6) continue;
      const v = this.visuals.get(e.id) ?? this.makeVisual(e);
      v.group.position.set(e.x, 0, e.z);
      if (e.kind === 'boss') {
        v.group.rotation.z = e.hit * 0.03;
        v.group.rotation.x = e.executing ? -0.3 * (1 - e.bossTime) : 0;
        v.group.position.y = Math.sin(time * 3) * (['dragon', 'manta', 'phoenix', 'seraph', 'void'].includes(bossInfo(e.archetype).body) ? .25 : .055);
        const windup = Math.max(0, 1 - e.attackTimer / .7);
        for (const part of v.joints ?? []) {
          const side = part.userData.side;
          switch (part.userData.action) {
            case 'wing': part.rotation.z = Math.sin(time * (e.enraged ? 9 : 7)) * .4 * side; break;
            case 'leg': part.rotation.x = Math.sin(time * 9 + part.position.z * 3) * .13; break;
            case 'claw': part.rotation.y = side * (.12 + windup * .35); break;
            case 'tail': part.rotation.x = -.2 + windup * .3; break;
            case 'hammer': part.rotation.x = -windup * .9 + e.hit * .18; break;
            case 'fist': part.rotation.x = -windup * .9; break;
            case 'scythe': part.rotation.z = Math.sin(time * 3) * .15 + windup * .65; break;
            case 'staff': part.rotation.z = Math.sin(time * 2) * .1; break;
            case 'halo': part.rotation.y = time * .8; part.rotation.z = time * .4; break;
            case 'neck': part.rotation.z = Math.sin(time * 2 * GAME_PACE + side) * .1; part.rotation.x = -windup * .22; break;
            case 'eye': part.rotation.y = Math.sin(time * .9) * .13; break;
            case 'tentacle': part.rotation.x = Math.sin(time * 3 * GAME_PACE + side) * .15 + windup * .2; break;
          }
        }
      }
      if (e.kind === 'enemy') {
        const batch = this.enemies.get(e.archetype) ?? this.enemies.get('raider')!;
        let redCount = enemyCounts.get(e.archetype) ?? 0;
        const n = e.archetype === 'mage' ? 3 : e.archetype === 'guard' ? 5 : Math.min(18, Math.max(3, Math.ceil(e.hp / 9)));
        const enemyCols = Math.min(5, Math.ceil(Math.sqrt(n)));
        for (let i = 0; i < n && redCount < 160; i++) {
          const row = Math.floor(i / enemyCols);
          this.dummy.position.set(
            e.x + (i % enemyCols - (Math.min(enemyCols, n - row * enemyCols) - 1) / 2) * 0.44,
            (active ? Math.abs(Math.sin(time * 13 * GAME_PACE + i)) * 0.065 : 0) + e.hit * 0.05,
            e.z - row * 0.45,
          );
          this.dummy.rotation.set(0, Math.PI, 0);
          this.dummy.scale.setScalar(e.archetype === 'guard' ? 1.05 : e.archetype === 'mage' ? 1.1 : 0.9);
          this.dummy.updateMatrix();
          batch.setMatrixAt(redCount++, this.dummy.matrix);
        }
        enemyCounts.set(e.archetype, redCount);
      }
      const bannerText = gateText(e);
      const charge = e.kind === 'gate' && (e.operation === 'multiply' || e.operation === 'forge') ? Math.round(gateProgress(e) * 20) : -1;
      if (v.banner && (v.hp !== bannerText || v.charge !== charge) && time - (v.labelTime ?? 0) >= .08) {
        const mat = v.banner.material as THREE.MeshStandardMaterial;
        const tint = gateColor(e), texture = mat.map as THREE.CanvasTexture;
        paintText(texture.image as HTMLCanvasElement, bannerText, tint);
        if (charge >= 0) {
          const canvas = texture.image as HTMLCanvasElement, ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff33'; ctx.fillRect(0, canvas.height - 5, canvas.width, 5);
          ctx.fillStyle = '#fff1b0'; ctx.fillRect(0, canvas.height - 5, canvas.width * charge / 20, 5);
        }
        texture.needsUpdate = true; mat.emissive.set(tint);
        if (v.floor) (v.floor.material as THREE.MeshBasicMaterial).color.set(tint);
        v.locked = e.locked; v.hp = bannerText; v.charge = charge; v.labelTime = time; this.labelUpdates++;
      }
      if (v.banner) { v.banner.scale.setScalar(1 + e.hit * .025); }
      if (v.label) v.label.visible = e.kind !== 'gate' || e.locked;
      const hp = e.kind === 'gate' ? `${Math.ceil(e.hp / e.maxHp * 100)}%` : compact(e.hp);
      if (v.label?.visible && v.shieldHp !== hp) {
        const texture = v.label.material.map as THREE.CanvasTexture;
        paintText(texture.image as HTMLCanvasElement, hp, e.kind === 'gate' ? '#675232dd' : e.kind === 'barrel' ? '#9d783add' : '#a44238dd');
        texture.needsUpdate = true; this.labelUpdates++;
        v.shieldHp = hp;
      }
    }
    for (const [type, batch] of this.enemies) {
      batch.count = enemyCounts.get(type) ?? 0; batch.instanceMatrix.needsUpdate = true;
    }
    const shotCounts = this.shotCounts;
    shotCounts.fill(0);
    this.trails.count = Math.min(engine.bullets.length, 180);
    for (let i = 0; i < this.trails.count; i++) {
      const b = engine.bullets[i];
      const visual = WEAPONS[b.weapon].visual;
      this.dummy.position.set(b.x, .82 + Math.sin(b.z * .11) * .13, b.z);
      const axial = axialWeapons.has(b.weapon);
      this.dummy.rotation.set(0, axial ? 0 : time * visual.spin, axial ? time * visual.spin : b.weapon === 6 ? Math.sin(time * 8 + i) * .2 : 0);
      this.dummy.scale.setScalar(visual.size);
      this.dummy.updateMatrix();
      this.shots[b.weapon].setMatrixAt(shotCounts[b.weapon]++, this.dummy.matrix);
      this.dummy.position.z += visual.trailLength * .6;
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(visual.trailWidth / .07, visual.trailWidth / .07, visual.trailLength / 1.8);
      this.dummy.updateMatrix(); this.trails.setMatrixAt(i, this.dummy.matrix);
      this.trails.setColorAt(i, this.weaponColors[b.weapon]);
    }
    for (let i = 0; i < WEAPONS.length; i++) {
      if (this.shots[i].count || shotCounts[i]) this.shots[i].instanceMatrix.needsUpdate = true;
      this.shots[i].count = shotCounts[i];
    }
    this.trails.instanceMatrix.needsUpdate = true; if (this.trails.instanceColor) this.trails.instanceColor.needsUpdate = true;
    const threatCounts = new Map<string, number>();
    this.threatTrails.count = Math.min(engine.threats.length, 160);
    for (let i = 0; i < this.threatTrails.count; i++) {
      const t = engine.threats[i];
      const kind = t.style === 'blade' ? 'blade' : t.style === 'lightning' ? 'bolt' : t.style === 'ice' || t.style === 'venom' ? 'spike' : 'orb';
      const batch = this.threatBatches.get(kind)!, index = threatCounts.get(kind) ?? 0;
      this.dummy.position.set(t.x, .75, t.z);
      this.dummy.scale.setScalar(t.radius / .24 * (1 + Math.sin(time * 20 + i) * .1));
      this.dummy.rotation.set(kind === 'spike' ? Math.PI / 2 : time * 4, kind === 'bolt' ? Math.atan2(t.vx, t.speed) : time * 3, kind === 'blade' ? time * 8 : 0);
      this.dummy.updateMatrix(); batch.setMatrixAt(index, this.dummy.matrix);
      this.tint.set(t.color ?? '#ff3f64').multiplyScalar(t.source ? 1.2 : 1.1);
      batch.setColorAt(index, this.tint); threatCounts.set(kind, index + 1);
      this.dummy.position.set(t.x - t.vx * .035, .75, t.z - t.speed * .04);
      this.dummy.rotation.set(0, Math.atan2(t.vx, t.speed), 0);
      this.dummy.scale.set(1, 1, t.source ? 2 : 1.1); this.dummy.updateMatrix();
      this.threatTrails.setMatrixAt(i, this.dummy.matrix); this.threatTrails.setColorAt(i, this.tint);
    }
    for (const [kind, batch] of this.threatBatches) {
      batch.count = threatCounts.get(kind) ?? 0; batch.instanceMatrix.needsUpdate = true;
      if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    }
    this.threatTrails.instanceMatrix.needsUpdate = true;
    if (this.threatTrails.instanceColor) this.threatTrails.instanceColor.needsUpdate = true;
    this.strikeZones.count = Math.min(16, engine.strikes.length);
    this.strikeAreas.count = this.strikeZones.count;
    for (let i = 0; i < this.strikeZones.count; i++) {
      const s = engine.strikes[i];
      this.dummy.position.set(s.x, 0.08, 0);
      this.dummy.rotation.set(-Math.PI / 2, 0, time * 3);
      this.dummy.scale.setScalar(s.radius * (1.15 + Math.sin(time * 24) * 0.08));
      this.dummy.updateMatrix(); this.strikeZones.setMatrixAt(i, this.dummy.matrix);
      this.strikeZones.setColorAt(i, this.tint.set(s.timer < 0.3 ? '#ffffff' : s.color ?? '#ff365d'));
      this.dummy.position.set(s.x, .035, -1.4);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.scale.set(s.radius, 1, .5 + (1 - s.timer / s.duration) * .5);
      this.dummy.updateMatrix(); this.strikeAreas.setMatrixAt(i, this.dummy.matrix);
      this.strikeAreas.setColorAt(i, this.tint);
    }
    this.strikeZones.instanceMatrix.needsUpdate = true;
    if (this.strikeZones.instanceColor) this.strikeZones.instanceColor.needsUpdate = true;
    this.strikeAreas.instanceMatrix.needsUpdate = true;
    if (this.strikeAreas.instanceColor) this.strikeAreas.instanceColor.needsUpdate = true;
    this.renderBattleEffects(engine, dt, time);
    if (engine.status !== 'paused') {
      let live = 0;
      for (const p of this.particles) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy -= dt * 9;
        if (p.life > 0) this.particles[live++] = p;
        else this.particlePool.push(p);
      }
      this.particles.length = live;
    }
    this.sparks.count = this.particles.length;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(time, time, 0);
      this.dummy.scale.setScalar(Math.max(0, p.life / p.max));
      this.dummy.updateMatrix();
      this.sparks.setMatrixAt(i, this.dummy.matrix);
      this.sparks.setColorAt(i, p.color);
    }
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    for (const wave of this.waves) {
      if (engine.status !== 'paused') wave.life = Math.max(0, wave.life - dt);
      wave.mesh.visible = wave.life > 0;
      wave.mesh.scale.setScalar(0.2 + (1 - wave.life / wave.max) * (wave.mesh.userData.radius ?? 2));
      (wave.mesh.material as THREE.MeshBasicMaterial).opacity = wave.life / wave.max * 0.8;
    }
    for (const chain of this.chains) {
      if (chain.life <= 0) continue;
      if (engine.status !== 'paused') chain.life -= dt;
      (chain.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, chain.life / 0.16);
      if (chain.life <= 0) chain.line.visible = false;
    }
    this.renderer.info.reset();
    this.composer.render();
    this.renderMs += (performance.now() - renderStart - this.renderMs) * .035;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
