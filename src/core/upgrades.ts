// ゼロ強化と金強化
import { D } from './decimal';
import { GOLD_UPGRADES, ZERO_UPGRADES, type UpgradeDef } from './data';
import { lvl, type State } from './state';

export interface Upgrade extends UpgradeDef {
  // 支払う通貨
  layer: 'zero' | 'gold';
}

export const UPGRADES: Readonly<Record<string, Upgrade>> = Object.fromEntries([
  ...ZERO_UPGRADES.map((u) => [u.id, { ...u, layer: 'zero' as const }] as const),
  ...GOLD_UPGRADES.map((u) => [u.id, { ...u, layer: 'gold' as const }] as const),
]);

export function upgCost(s: State, id: string): D {
  return D.from(UPGRADES[id].cost(lvl(s, id)));
}

export function upgMaxed(s: State, id: string): boolean {
  return lvl(s, id) >= UPGRADES[id].max;
}

export function canBuyUpg(s: State, id: string): boolean {
  const bank = UPGRADES[id].layer === 'gold' ? s.gold : s.zeros;
  return !upgMaxed(s, id) && bank.gte(upgCost(s, id));
}

export function buyUpg(s: State, id: string): boolean {
  if (!canBuyUpg(s, id)) return false;
  const u = UPGRADES[id];
  const cost = upgCost(s, id);
  if (u.layer === 'gold') {
    s.gold = s.gold.sub(cost);
    s.gu[id] = lvl(s, id) + 1;
  } else {
    s.zeros = s.zeros.sub(cost);
    s.zu[id] = lvl(s, id) + 1;
  }
  return true;
}
