import { FINAL_WEAPON } from './weapons.ts';
export interface RunRecord {
  id: string; name: string; score: number; distance: number; kills: number;
  combo: number; seconds: number; weapon: number; at: number;
}
export const LEADERBOARD_KEY = 'top-shooter-arcade-scores-v2';
export function normalizeRecords(raw: unknown): RunRecord[] {
  if (!Array.isArray(raw)) return [];
  const records: RunRecord[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<RunRecord>;
    if (typeof r.id !== 'string' || ids.has(r.id) || typeof r.name !== 'string' ||
      ![r.score, r.distance, r.kills, r.combo, r.seconds, r.weapon, r.at].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0) ||
      !r.score || !Number.isInteger(r.weapon) || r.weapon! > FINAL_WEAPON) continue;
    ids.add(r.id);
    records.push({ ...r, name: r.name.trim().slice(0, 12) || '无名射手', score: Math.floor(r.score!) } as RunRecord);
  }
  return records.sort((a, b) => b.score - a.score || b.distance - a.distance || a.at - b.at).slice(0, 10);
}
export function loadRecords(): RunRecord[] {
  try { return normalizeRecords(JSON.parse(localStorage.getItem(LEADERBOARD_KEY) ?? '[]')); } catch { return []; }
}
export function storeRecord(record: RunRecord) {
  const records = normalizeRecords([...loadRecords(), record]);
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(records)); } catch { /* Records remain available in memory if storage is disabled. */ }
  return records;
}
