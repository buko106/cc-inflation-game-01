// 時間経過
import { runAuto } from './automation';
import { rawDenomGain } from './prestige';
import { compute } from './production';
import { lvl, type State } from './state';

// dt 秒だけ進める
export function step(s: State, dt: number): void {
  const c = compute(s);
  const gained = c.rates[0].mul(dt);
  s.money = s.money.add(gained);
  s.stats.totalEver = s.stats.totalEver.add(gained);
  for (let i = 1; i < c.n; i++) {
    s.gens[i - 1].amt = s.gens[i - 1].amt.add(c.rates[i].mul(dt));
  }
  if (lvl(s, 'gInterest')) {
    const z = rawDenomGain(s).mul(0.01 * dt);
    s.zeros = s.zeros.add(z);
    s.zerosTotal = s.zerosTotal.add(z);
  }
  s.stats.played += dt;
  s.stats.denomTime += dt;
  s.stats.goldTime += dt;
  if (s.money.gt(s.stats.best)) s.stats.best = s.money;
  if (s.money.gt(s.stats.bestEver)) s.stats.bestEver = s.money;
  runAuto(s);
}

// 長い時間 (オフライン中など) を最大 maxSteps 回に分けて進める
export function advance(s: State, sec: number, maxSteps?: number): void {
  if (!(sec > 0)) return;
  const steps = Math.max(1, Math.min(maxSteps || 1000, Math.ceil(sec / 0.05)));
  const dt = sec / steps;
  for (let i = 0; i < steps; i++) step(s, dt);
}
