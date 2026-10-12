// 自動化 (自動購入・自動量的緩和・自動デノミ)
import { D } from './decimal';
import { canDenom, canQE, denomGain, doDenom, doQE } from './prestige';
import { buyMax, buyTickMax } from './purchase';
import { lvl, type State } from './state';

// 自動購入ごとに受け持つ段 (上の段から買う)
const AUTO_TIERS: Readonly<Record<string, readonly number[]>> = { aLow: [2, 1, 0], aMid: [5, 4, 3], aHigh: [7, 6] };

export function autoActive(s: State, id: string): boolean {
  return lvl(s, id) > 0 && s.autoOn[id] !== false;
}

export function autoDenomReady(s: State): boolean {
  if (!canDenom(s)) return false;
  const a = s.autoDenom;
  if (a.mode === 'time') return s.stats.denomTime >= Number(a.value || 0);
  return denomGain(s).gte(D.from(a.value || '1').max(1));
}

export function runAuto(s: State): void {
  for (const id of ['aHigh', 'aMid', 'aLow']) {
    if (autoActive(s, id)) for (const i of AUTO_TIERS[id]) buyMax(s, i);
  }
  if (autoActive(s, 'aTick')) buyTickMax(s);
  if (autoActive(s, 'aQE') && canQE(s)) doQE(s);
  if (autoActive(s, 'aDenom') && autoDenomReady(s)) doDenom(s);
}
