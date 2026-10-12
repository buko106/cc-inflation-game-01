// 造幣機と印刷速度の購入
import { D } from './decimal';
import { GENS, RULES } from './data';
import { unlockedTiers } from './production';
import type { State } from './state';

export function unitCost(s: State, i: number): D {
  const g = GENS[i];
  return D.pow10(g.base + g.inc * Math.floor(s.gens[i].bought / 10));
}

export function batchSize(s: State, i: number): number {
  return 10 - (s.gens[i].bought % 10);
}

export function batchCost(s: State, i: number): D {
  return unitCost(s, i).mul(batchSize(s, i));
}

export function pay(s: State, cost: D): boolean {
  if (!s.money.gte(cost)) return false;
  s.money = s.money.sub(cost);
  return true;
}

function addGens(s: State, i: number, n: number): void {
  s.gens[i].amt = s.gens[i].amt.add(n);
  s.gens[i].bought += n;
}

export function buyOne(s: State, i: number): boolean {
  if (i >= unlockedTiers(s) || !pay(s, unitCost(s, i))) return false;
  addGens(s, i, 1);
  return true;
}

export function buyBatch(s: State, i: number): boolean {
  if (i >= unlockedTiers(s)) return false;
  const n = batchSize(s, i);
  if (!pay(s, batchCost(s, i))) return false;
  addGens(s, i, n);
  return true;
}

// 買えるだけ買う。10台単位でまとめ買いし、残ったお金で1台ずつ買う
// 購入の繰り返しの上限。まとめ買いのあとは数回で終わるはずだが、
// 計算誤差で価格が上がらなくなっても処理が止まる (画面が固まらない) ようにする
const MAX_REPEAT = 100;

function repeat(times: number, fn: () => boolean): number {
  let n = 0;
  while (n < times && fn()) n++;
  return n;
}

export function buyMax(s: State, i: number): number {
  if (i >= unlockedTiers(s)) return 0;
  const before = s.gens[i].bought;
  if (s.gens[i].bought % 10 !== 0 && !buyBatch(s, i)) {
    repeat(10, () => buyOne(s, i));
    return s.gens[i].bought - before;
  }
  const g = GENS[i];
  // 10台セット j の価格は 10^(1 + base + inc × j)。桁が大きいときは等比級数でまとめて払う
  const jmax = Math.floor((s.money.log10() - 1 - g.base) / g.inc);
  const j = s.gens[i].bought / 10;
  if (jmax - j > 3) {
    const last = jmax - 2;
    const total = D.pow10(1 + g.base + g.inc * last).mul(1 / (1 - Math.pow(10, -g.inc)));
    if (pay(s, total)) addGens(s, i, 10 * (last - j + 1));
  }
  repeat(MAX_REPEAT, () => buyBatch(s, i));
  repeat(10, () => buyOne(s, i));
  return s.gens[i].bought - before;
}

export function maxAll(s: State): number {
  let bought = 0;
  for (let i = unlockedTiers(s) - 1; i >= 0; i--) bought += buyMax(s, i);
  bought += buyTickMax(s);
  return bought;
}

// ---- 印刷速度 ----

function tickCostExp(t: number): number {
  return RULES.tickCostBase + RULES.tickCostInc * t + RULES.tickCostQuad * t * t;
}

export function tickCost(s: State): D {
  return D.pow10(tickCostExp(s.tick));
}

export function buyTick(s: State): boolean {
  if (!pay(s, tickCost(s))) return false;
  s.tick += 1;
  return true;
}

export function buyTickMax(s: State): number {
  const before = s.tick;
  // tickCostExp(t) <= log10(資産) を満たす最大の t。1回ごとに価格は10倍以上になるので等比級数で上から抑えられる
  const a = RULES.tickCostQuad;
  const b = RULES.tickCostInc;
  const c = RULES.tickCostBase - s.money.log10();
  const tmax = Math.floor(a > 0 ? (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a) : -c / b);
  if (tmax - s.tick > 3) {
    const last = tmax - 2;
    const total = D.pow10(tickCostExp(last)).mul(1 / (1 - Math.pow(10, -b)));
    if (pay(s, total)) s.tick = last + 1;
  }
  repeat(MAX_REPEAT, () => buyTick(s));
  return s.tick - before;
}
