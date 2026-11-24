import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
let html = await readFile(path.join(dist, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g)];
if (scripts.length !== 1) throw new Error(`Expected one bundled script, got ${scripts.length}`);
for (const [tag, src] of scripts) {
  const code = await readFile(path.join(dist, src), 'utf8');
  html = html.replace(tag, () => `<script type="module">${code.replace(/<\/script/gi, '<\\/script')}</script>`);
}
for (const [tag, href] of [...html.matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g)]) {
  const css = await readFile(path.join(dist, href), 'utf8');
  html = html.replace(tag, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
}
html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, '');
if (/<script\b[^>]*\bsrc=|<link\b[^>]*\brel="stylesheet"/i.test(html)) throw new Error('External resources remain');
const license = await readFile(path.join(root, 'node_modules/three/LICENSE'), 'utf8');
html = html.replace('<html', `<!-- Self-contained offline edition. Three.js license:\n${license.replace(/-->/g, '-- >')}\n-->\n<html`);
const output = path.join(root, 'game_topshooter.html');
await writeFile(output, html);
await writeFile(path.join(dist, 'game_topshooter.html'), html);
console.log(`Offline HTML: ${output} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB)`);
