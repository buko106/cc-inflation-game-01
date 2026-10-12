// 数値の表示。日本式 (万・億・兆…無量大数) / 指数 / 工学 の3種類。
import { D, type DLike } from './decimal';

export type Notation = 'jp' | 'sci' | 'eng';

export const JP_UNITS = [
  '', '万', '億', '兆', '京', '垓', '秭', '穣', '溝', '澗', '正', '載', '極',
  '恒河沙', '阿僧祇', '那由他', '不可思議', '無量大数',
] as const;
// 無量大数 (1e68) の次の単位は存在しないので、1e72 から指数表記に切り替える
const JP_LIMIT = JP_UNITS.length * 4;

// 既定の表記。設定画面で切り替えると UI がここを書き換える
export const fmt: { notation: Notation } = { notation: 'jp' };

export interface FormatOptions {
  int?: boolean;
  notation?: Notation;
}

function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtExponent(e: number): string {
  if (e < 1e9) return groupDigits(e);
  return Number(e).toExponential(2).replace('+', '');
}

// 仮数を小数 decimals 桁で丸めた [m, e] を返す (9.996 → 10.00 の繰り上がりも正規化する)
function rounded(x: D, decimals: number): [number, number] {
  const p = Math.pow(10, decimals);
  let m = Math.round(x.m * p) / p;
  let e = x.e;
  if (m >= 10) {
    m /= 10;
    e += 1;
  }
  return [m, e];
}

function fixedBySize(v: number): string {
  if (v < 10) return v.toFixed(2);
  if (v < 100) return v.toFixed(1);
  return v.toFixed(0);
}

export function format(value: DLike, opts?: FormatOptions): string {
  const x = D.from(value);
  const int = opts && opts.int;
  if (x.isZero()) return '0';
  if (x.e < 0 && int) return '0';
  if (x.e < 3) {
    const n = x.toNumber();
    if (int) return String(Math.floor(n + 1e-9));
    return fixedBySize(n);
  }
  if (x.e < 4) return groupDigits(Math.floor(x.toNumber() + 1e-9));

  const notation = (opts && opts.notation) || fmt.notation;
  if (notation === 'jp' && x.e < JP_LIMIT) {
    // 表示は有効数字3桁 (1000以上の位だけ4桁)。丸めは1回だけにする
    const [m, e] = rounded(x, x.e % 4 === 3 ? 3 : 2);
    const idx = Math.floor(e / 4);
    if (idx < JP_UNITS.length) {
      const v = m * Math.pow(10, e - idx * 4);
      return (v >= 1000 ? v.toFixed(0) : fixedBySize(v)) + JP_UNITS[idx];
    }
  }
  if (notation === 'eng') {
    const [m, e] = rounded(x, 2);
    const e3 = Math.floor(e / 3) * 3;
    const v = m * Math.pow(10, e - e3);
    return `${fixedBySize(v)}e${fmtExponent(e3)}`;
  }
  const [m, e] = rounded(x, 2);
  return `${m.toFixed(2)}e${fmtExponent(e)}`;
}

export function formatMult(value: DLike): string {
  const x = D.from(value);
  if (x.e < 3) return '×' + x.toNumber().toFixed(2);
  return '×' + format(x);
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec)) return '∞';
  if (sec < 1) return `${sec.toFixed(2)}秒`;
  if (sec < 60) return `${sec.toFixed(1)}秒`;
  const s = Math.floor(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (d > 0) return `${d}日${h}時間`;
  if (h > 0) return `${h}時間${m}分`;
  return `${m}分${r}秒`;
}
