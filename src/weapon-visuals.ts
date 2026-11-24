import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WeaponDefinition } from './weapons';

export function projectileGeometry(weapon: WeaponDefinition) {
  const parts: THREE.BufferGeometry[] = [];
  const part = (geometry: THREE.BufferGeometry, color = weapon.color, x = 0, y = 0, z = 0,
    sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    flat.applyMatrix4(matrix); flat.deleteAttribute('uv');
    const tint = new THREE.Color(color), colors = new Float32Array(flat.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = tint.r; colors[i + 1] = tint.g; colors[i + 2] = tint.b; }
    flat.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts.push(flat);
    if (flat !== geometry) geometry.dispose();
  };
  const beam = (width: number, length: number, color = weapon.color, x = 0, y = 0, z = 0, ry = 0) =>
    part(new THREE.BoxGeometry(width, width, length), color, x, y, z, 1, 1, 1, 0, ry);
  const ring = (radius: number, color = weapon.accent, rx = -Math.PI / 2, ry = 0, z = 0, arc = Math.PI * 2) =>
    part(new THREE.TorusGeometry(radius, .032, 4, 20, arc), color, 0, 0, z, 1, 1, 1, rx, ry);
  const core = (radius: number, color = weapon.accent, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) =>
    part(new THREE.IcosahedronGeometry(radius, 0), color, x, y, z, sx, sy, sz);
  switch (weapon.id) {
    case 'dart':
      beam(.045, 1.05); part(new THREE.ConeGeometry(.09, .22, 4), weapon.accent, 0, 0, -.59, 1, 1, 1, -Math.PI / 2); break;
    case 'shard':
      part(new THREE.OctahedronGeometry(.23), weapon.color, 0, 0, 0, .75, .8, 1.7); core(.08); break;
    case 'flame':
      core(.23, weapon.color, 0, 0, 0, 1, .7, 1.6); core(.11, weapon.accent, 0, .035, -.1);
      part(new THREE.ConeGeometry(.19, .7, 5), weapon.color, 0, 0, .46, 1, 1, 1, Math.PI / 2); break;
    case 'lightning':
      for (let i = 0; i < 4; i++) beam(.07, .5, i % 2 ? weapon.accent : weapon.color, i % 2 ? .11 : -.11, 0, (i - 1.5) * .4, i % 2 ? -.55 : .55);
      break;
    case 'rocket':
      part(new THREE.CylinderGeometry(.1, .1, .52, 7), '#cbdfe6', 0, 0, 0, 1, 1, 1, Math.PI / 2);
      part(new THREE.ConeGeometry(.14, .35, 6), weapon.color, 0, 0, -.39, 1, 1, 1, -Math.PI / 2);
      for (const side of [-1, 1]) part(new THREE.BoxGeometry(.22, .035, .27), weapon.accent, side * .15, 0, .18);
      core(.095, weapon.color, 0, 0, .33); break;
    case 'blades':
      ring(.35, weapon.color, -Math.PI / 2, 0, -.15, Math.PI * 1.35);
      ring(.28, weapon.accent, Math.PI / 2, .3, .15, Math.PI * 1.35); core(.08); break;
    case 'swarm':
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        part(new THREE.OctahedronGeometry(.12), i % 2 ? weapon.accent : weapon.color,
          Math.cos(a) * .22, Math.sin(a) * .12, Math.sin(a) * .22, .65, .65, 1.7);
      }
      break;
    case 'rail':
      beam(.05, 2.5, weapon.color, -.11); beam(.05, 2.5, weapon.color, .11);
      beam(.035, 1.8, weapon.accent); ring(.18, weapon.accent, 0, 0, -.7); break;
    case 'drill':
      part(new THREE.ConeGeometry(.23, .75, 7), weapon.color, 0, 0, -.15, 1, 1, 1, -Math.PI / 2);
      for (let i = 0; i < 3; i++) ring(.11 + i * .05, weapon.accent, .2, i * .3, -.22 + i * .17); break;
    case 'disc':
      ring(.35, weapon.color); ring(.21); beam(.06, .65, weapon.accent); core(.07); break;
    case 'star':
      for (let i = 0; i < 3; i++) beam(.055, .7, i % 2 ? weapon.accent : weapon.color, 0, 0, 0, i * Math.PI / 3);
      part(new THREE.OctahedronGeometry(.18), weapon.accent); break;
    case 'pulse':
      ring(.31, weapon.color, 0, 0, -.15); ring(.24, weapon.accent, 0, 0, .2); core(.12); break;
    case 'comet':
      core(.25, weapon.color, 0, 0, -.2, 1, .8, 1.3);
      for (let i = 0; i < 3; i++) part(new THREE.ConeGeometry(.1, 1 - i * .12, 5), i % 2 ? weapon.color : weapon.accent,
        (i - 1) * .13, 0, .43, 1, 1, 1, Math.PI / 2); break;
    case 'cross':
      beam(.09, .82); beam(.09, .82, weapon.accent, 0, 0, 0, Math.PI / 2);
      part(new THREE.OctahedronGeometry(.18), weapon.accent, 0, 0, 0, 1, .6, 1); break;
    case 'rainbow':
      ring(.35, weapon.color, -.9, -.5); ring(.3, weapon.accent, .9, .5); core(.1, '#fff4ce'); break;
    case 'spear':
      part(new THREE.OctahedronGeometry(.22), weapon.accent, 0, 0, -.4, .7, .65, 3);
      beam(.07, 1.2, weapon.color, 0, 0, .3); ring(.14, weapon.color, 0, 0, .55); break;
    case 'prism':
      part(new THREE.TetrahedronGeometry(.3), weapon.color, 0, 0, 0, 1, .8, 1.2);
      for (let i = 0; i < 4; i++) core(.085, weapon.accent, Math.cos(i * Math.PI / 2) * .32, 0, Math.sin(i * Math.PI / 2) * .32);
      break;
    case 'crescent':
      for (let i = 0; i < 3; i++) ring(.22 + i * .09, i % 2 ? weapon.accent : weapon.color, -.7 + i * .25, i * .4, (i - 1) * .1, Math.PI * 1.2);
      break;
    case 'nova':
      ring(.3, weapon.color); core(.14);
      for (let i = 0; i < 6; i++) part(new THREE.OctahedronGeometry(.075), weapon.accent, Math.cos(i * Math.PI / 3) * .37, 0, Math.sin(i * Math.PI / 3) * .37, 1, 1, 1.5);
      break;
    case 'singularity':
      core(.23, '#251c46'); ring(.37, weapon.color, -.6, .5); ring(.32, weapon.accent, .6, -.5);
      core(.065, '#f5eeff', .21, .09, -.22); break;
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}
