// 実績とエンディング
import { ACHIEVEMENTS, RULES, type AchievementDef } from './data';
import type { State } from './state';

// 条件を満たした未解除の実績を解除し、解除したものを返す
export function checkAchievements(s: State, now?: number): AchievementDef[] {
  const unlocked: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.ach[a.id] && a.check(s)) {
      s.ach[a.id] = now || Date.now();
      unlocked.push(a);
    }
  }
  return unlocked;
}

export function reachedEnd(s: State): boolean {
  return s.money.log10() >= RULES.endExp;
}
