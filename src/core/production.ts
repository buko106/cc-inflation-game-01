// 倍率と毎秒の生産量
import { D } from './decimal';
import { GENS, RULES } from './data';
import { lvl, type State } from './state';

export function tickBase(s: State): number {
  return RULES.tickBase + RULES.zTickStep * lvl(s, 'zTick') + 0.05 * lvl(s, 'gTick');
}

export function per10(s: State): number {
  return RULES.per10Base + RULES.zPer10Step * lvl(s, 'zPer10') + 0.5 * lvl(s, 'gPer10');
}

export function qeBase(s: State): number {
  return lvl(s, 'zQE') ? 3 : 2;
}

export function achMult(s: State): D {
  return D.from(1.05).pow(Object.keys(s.ach).length);
}

export function globalMult(s: State): D {
  let m = D.from(qeBase(s)).pow(s.qe);
  m = m.mul(D.from(RULES.zMultBase).pow(lvl(s, 'zMult')));
  if (lvl(s, 'zCount')) m = m.mul(Math.pow(1 + s.denoms, 1.5));
  if (lvl(s, 'zZero')) m = m.mul(s.zerosTotal.add(1).pow(RULES.zZeroPow));
  m = m.mul(D.from(1000).pow(lvl(s, 'gMult')));
  m = m.mul(s.goldTotal.add(1).pow(2));
  return m.mul(achMult(s));
}

export function unlockedTiers(s: State): number {
  return Math.min(GENS.length, RULES.qeBaseTiers + s.qe);
}

export interface Production {
  global: D;
  tickMult: D;
  // 段ごとの倍率
  mults: D[];
  // 段ごとの毎秒の生産量。rates[0] は円、rates[i] は i-1 段目の造幣機
  rates: D[];
  // 解放済みの段数
  n: number;
  moneyRate: D;
  softcapped: boolean;
}

// 毎秒の生産量などをまとめて計算する
export function compute(s: State): Production {
  const global = globalMult(s);
  const p10 = D.from(per10(s));
  const tickMult = D.from(tickBase(s)).pow(s.tick).mul(RULES.speed);
  const n = unlockedTiers(s);
  const mults = GENS.map((_, i) => p10.pow(Math.floor(s.gens[i].bought / 10)).mul(global));
  const rates = GENS.map((_, i) => {
    if (i >= n) return D.ZERO;
    const r = s.gens[i].amt.mul(mults[i]).mul(tickMult);
    return i === 0 ? r : r.mul(RULES.tierRate);
  });
  const raw = rates[0];
  rates[0] = softcap(raw);
  return { global, tickMult, mults, rates, n, moneyRate: rates[0], softcapped: rates[0] !== raw };
}

// エンディング後は倍率どうしが掛け合わさり、1回の周回のなかで資産の桁数が際限なく増えていく。
// 毎秒の生産の桁数を抑えて、その暴走を止める
export function softcap(rate: D): D {
  const L = rate.log10();
  if (!(L > RULES.softcapAt)) return rate;
  return D.fromLog10(RULES.softcapAt + Math.pow(L - RULES.softcapAt, RULES.softcapPow));
}

// 資産が2倍になるまでの秒数 (いまの生産量のまま)
export function doublingTime(s: State, c?: Production): number {
  const rate = (c || compute(s)).moneyRate;
  if (rate.isZero()) return Infinity;
  return s.money.div(rate).toNumber();
}
