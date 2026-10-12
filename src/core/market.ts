// 物価
import type { D } from './decimal';
import { PRICES } from './data';
import { pay } from './purchase';
import type { State } from './state';

// 物価指数。資産の最高額にほぼ比例して上がる
export function priceIndex(s: State): D {
  return s.stats.best.max(10).div(10).pow(0.92);
}

export function price(s: State, id: string): D {
  const item = PRICES.find((p) => p.id === id);
  if (!item) throw new Error(`unknown price id: ${id}`);
  return priceIndex(s).mul(item.base);
}

export function buyBread(s: State): boolean {
  if (!pay(s, price(s, 'bread'))) return false;
  s.stats.breads += 1;
  return true;
}
