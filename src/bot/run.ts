// 戦略を早送りで走らせ、各到達点までの時間を測る
import * as G from '../core';
import type { Strategy } from './strategy';

export interface Milestone {
  id: string;
  label: string;
  reached: (s: G.State) => boolean;
}

export const MILESTONES: readonly Milestone[] = [
  { id: 'denom', label: '最初のデノミ', reached: (s) => s.denoms > 0 || s.golds > 0 },
  { id: 'gold', label: '金本位制', reached: (s) => s.golds > 0 },
  { id: 'e1000', label: '1e1000円', reached: (s) => s.stats.bestEver.log10() >= 1000 },
  { id: 'end', label: 'インフレの果て', reached: (s) => G.reachedEnd(s) || s.stats.bestEver.log10() >= G.RULES.endExp },
];

export interface RunOptions {
  // ゲーム内で何秒まで進めるか
  maxSec?: number;
  // 1ステップの秒数。ゲーム本体は 0.05 秒
  dt?: number;
}

export interface RunResult {
  strategy: string;
  // 到達点 id → 到達したゲーム内の秒数 (届かなければ null)
  times: Record<string, number | null>;
  // 実際に進めた秒数 (すべて届いたらそこで止める)
  simulated: number;
  denoms: number;
  golds: number;
  bestLog10: number;
}

export function runStrategy(st: Strategy, opts: RunOptions = {}): RunResult {
  const maxSec = opts.maxSec ?? 2 * 3600;
  const dt = opts.dt ?? 0.05;
  // 実績の解除時刻だけに使う。結果は時刻に依存しない
  const s = G.newState(1);
  st.setup?.(s);
  const times: Record<string, number | null> = Object.fromEntries(MILESTONES.map((m) => [m.id, null]));
  let t = 0;
  let nextAct = 0;
  while (t < maxSec) {
    if (t >= nextAct) {
      st.act(s);
      nextAct += st.actEvery;
    }
    G.step(s, dt);
    t += dt;
    G.checkAchievements(s, 1);
    let all = true;
    for (const m of MILESTONES) {
      if (times[m.id] === null && m.reached(s)) times[m.id] = t;
      if (times[m.id] === null) all = false;
    }
    if (all) break;
  }
  return { strategy: st.name, times, simulated: t, denoms: s.denoms, golds: s.golds, bestLog10: s.stats.bestEver.log10() };
}
