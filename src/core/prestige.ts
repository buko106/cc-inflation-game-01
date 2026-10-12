// リセットを伴う3つの段階: 量的緩和・デノミ・金本位制
import { D } from './decimal';
import { GENS, RULES } from './data';
import { AUTO_IDS, emptyGens, lvl, type State } from './state';

const START_MONEY = [10, 1e3, 1e6, 1e8, 1e12];
const START_ZEROS = [0, 1e3, 1e6, 1e9];

export function startMoney(s: State): D {
  return D.from(START_MONEY[lvl(s, 'zStart')]);
}

function resetMint(s: State): void {
  s.money = startMoney(s);
  s.gens = emptyGens();
  s.tick = 0;
}

// ---- 量的緩和 (造幣機をリセットして次の段を解放、全体を強化) ----

export function qeTier(s: State): number {
  return Math.min(GENS.length - 1, RULES.qeBaseTiers - 1 + s.qe);
}

export function qeReq(s: State): number {
  return RULES.qeReqBase + Math.max(0, s.qe - (GENS.length - RULES.qeBaseTiers)) * RULES.qeReqStep;
}

export function canQE(s: State): boolean {
  return s.gens[qeTier(s)].bought >= qeReq(s);
}

export function doQE(s: State): boolean {
  if (!canQE(s)) return false;
  s.qe += 1;
  resetMint(s);
  return true;
}

// ---- デノミ (ゼロを得る) ----

export function denomScale(s: State): number {
  return RULES.denomScale - 2 * lvl(s, 'gExp');
}

function zeroGainMult(s: State): D {
  return D.from(2).pow(lvl(s, 'zGain')).mul(D.from(10).pow(lvl(s, 'gZero')));
}

export function canDenom(s: State): boolean {
  return s.money.log10() >= RULES.denomAt;
}

export function rawDenomGain(s: State): D {
  const L = s.money.log10();
  if (L < RULES.denomAt) return D.ZERO;
  return D.fromLog10((L - RULES.denomAt) / denomScale(s)).mul(zeroGainMult(s));
}

export function denomGain(s: State): D {
  return rawDenomGain(s).floor();
}

// 獲得ゼロが1個増える資産
export function nextDenomAt(s: State): D {
  const target = denomGain(s).add(1).div(zeroGainMult(s)).log10();
  return D.fromLog10(RULES.denomAt + Math.max(0, target) * denomScale(s));
}

export function doDenom(s: State): boolean {
  if (!canDenom(s)) return false;
  const gain = denomGain(s);
  s.zeros = s.zeros.add(gain);
  s.zerosTotal = s.zerosTotal.add(gain);
  s.denoms += 1;
  const t = s.stats.denomTime;
  if (s.stats.fastestDenom === null || t < s.stats.fastestDenom) s.stats.fastestDenom = t;
  s.stats.history.unshift({ time: t, gain: gain });
  s.stats.history.length = Math.min(s.stats.history.length, 10);
  s.qe = lvl(s, 'zKeepQE') ? 4 : 0;
  resetMint(s);
  s.stats.denomTime = 0;
  s.stats.best = s.money;
  return true;
}

// ---- 金本位制 (金塊を得る) ----

export function canGold(s: State): boolean {
  return s.money.log10() >= RULES.goldAt;
}

export function goldGain(s: State): D {
  const L = s.money.log10();
  if (L < RULES.goldAt) return D.ZERO;
  return D.fromLog10((L - RULES.goldAt) / RULES.goldScale).floor().max(1);
}

export function doGold(s: State): boolean {
  if (!canGold(s)) return false;
  const gain = goldGain(s);
  s.gold = s.gold.add(gain);
  s.goldTotal = s.goldTotal.add(gain);
  s.golds += 1;
  const keep: Record<string, number> = {};
  for (const id of AUTO_IDS) if (s.zu[id]) keep[id] = s.zu[id];
  s.zu = keep;
  s.zeros = D.from(START_ZEROS[lvl(s, 'gStart')]);
  s.zerosTotal = s.zeros;
  s.qe = 0;
  resetMint(s);
  s.stats.denomTime = 0;
  s.stats.goldTime = 0;
  s.stats.best = s.money;
  return true;
}
