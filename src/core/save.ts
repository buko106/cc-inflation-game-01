// セーブデータの書き出しと読み込み
import { D, type DLike } from './decimal';
import { GENS } from './data';
import { newState, type State } from './state';

export function serialize(s: State): string {
  return JSON.stringify(s);
}

// JSON.parse したままのセーブ。古い版や壊れたデータも来るので、中身は信用しない
type Raw = any;

export function deserialize(json: string | object): State {
  const raw: Raw = typeof json === 'string' ? JSON.parse(json) : json;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.gens)) throw new Error('セーブデータの形式が違います');
  const s = newState(raw.last);
  const d = (x: DLike | null | undefined, fallback: D) => (x === undefined || x === null ? fallback : D.from(x));
  const n = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? x : fallback);
  s.money = d(raw.money, s.money);
  s.gens = GENS.map((_, i) => {
    const g: Raw = raw.gens[i] || {};
    return { amt: d(g.amt, D.ZERO), bought: n(g.bought, 0) };
  });
  s.tick = n(raw.tick, 0);
  s.qe = n(raw.qe, 0);
  s.zeros = d(raw.zeros, D.ZERO);
  s.zerosTotal = d(raw.zerosTotal, D.ZERO);
  s.denoms = n(raw.denoms, 0);
  s.zu = { ...(raw.zu || {}) };
  s.gold = d(raw.gold, D.ZERO);
  s.goldTotal = d(raw.goldTotal, D.ZERO);
  s.golds = n(raw.golds, 0);
  s.gu = { ...(raw.gu || {}) };
  Object.assign(s.autoOn, raw.autoOn || {});
  if (raw.autoDenom) s.autoDenom = { mode: raw.autoDenom.mode === 'time' ? 'time' : 'gain', value: String(raw.autoDenom.value ?? '1') };
  s.ach = { ...(raw.ach || {}) };
  const rs: Raw = raw.stats || {};
  s.stats.played = n(rs.played, 0);
  s.stats.denomTime = n(rs.denomTime, 0);
  s.stats.goldTime = n(rs.goldTime, 0);
  s.stats.best = d(rs.best, s.money);
  s.stats.bestEver = d(rs.bestEver, s.money);
  s.stats.totalEver = d(rs.totalEver, D.ZERO);
  s.stats.fastestDenom = Number.isFinite(rs.fastestDenom) ? rs.fastestDenom : null;
  s.stats.history = (rs.history || []).slice(0, 10).map((h: Raw) => ({ time: n(h.time, 0), gain: d(h.gain, D.ZERO) }));
  s.stats.breads = n(rs.breads, 0);
  Object.assign(s.settings, raw.settings || {});
  s.endingSeen = !!raw.endingSeen;
  s.last = n(raw.last, Date.now());
  return s;
}

// エクスポート用。日本語を含んでも壊れないよう UTF-8 → base64
export function exportSave(s: State): string {
  const bytes = new TextEncoder().encode(serialize(s));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function importSave(text: string): State {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return deserialize(trimmed);
  const bin = atob(trimmed);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return deserialize(new TextDecoder().decode(bytes));
}
