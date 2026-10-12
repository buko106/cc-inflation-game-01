// ゲームの状態の形と、最初の状態
import { D } from './decimal';
import { GENS, RULES, ZERO_UPGRADES } from './data';
import type { Notation } from './format';

export const SAVE_VERSION = 1;

export const AUTO_IDS: readonly string[] = ZERO_UPGRADES.filter((u) => u.auto).map((u) => u.id);

export interface GenState {
  amt: D;
  bought: number;
}

export interface AutoDenom {
  // time: 前回から value 秒たったら / gain: value 個以上のゼロがもらえたら
  mode: 'time' | 'gain';
  value: string;
}

export interface DenomRecord {
  time: number;
  gain: D;
}

export interface Stats {
  played: number;
  denomTime: number;
  goldTime: number;
  // いまの周回 (デノミ・金本位制のあと) での最高額
  best: D;
  bestEver: D;
  totalEver: D;
  fastestDenom: number | null;
  history: DenomRecord[];
  breads: number;
}

export interface Settings {
  notation: Notation;
  news: boolean;
}

export interface State {
  v: number;
  money: D;
  gens: GenState[];
  tick: number;
  qe: number;
  zeros: D;
  zerosTotal: D;
  denoms: number;
  // ゼロ強化のレベル (id → レベル)
  zu: Record<string, number>;
  gold: D;
  goldTotal: D;
  golds: number;
  // 金強化のレベル (id → レベル)
  gu: Record<string, number>;
  autoOn: Record<string, boolean>;
  autoDenom: AutoDenom;
  // 実績 id → 解除した時刻
  ach: Record<string, number>;
  stats: Stats;
  settings: Settings;
  endingSeen: boolean;
  last: number;
}

export function emptyGens(): GenState[] {
  return GENS.map(() => ({ amt: D.ZERO, bought: 0 }));
}

export function newState(now?: number): State {
  return {
    v: SAVE_VERSION,
    money: D.from(RULES.startMoney),
    gens: emptyGens(),
    tick: 0,
    qe: 0,
    zeros: D.ZERO,
    zerosTotal: D.ZERO,
    denoms: 0,
    zu: {},
    gold: D.ZERO,
    goldTotal: D.ZERO,
    golds: 0,
    gu: {},
    autoOn: Object.fromEntries(AUTO_IDS.map((id) => [id, true])),
    autoDenom: { mode: 'time', value: '60' },
    ach: {},
    stats: {
      played: 0,
      denomTime: 0,
      goldTime: 0,
      best: D.from(RULES.startMoney),
      bestEver: D.from(RULES.startMoney),
      totalEver: D.ZERO,
      fastestDenom: null,
      history: [],
      breads: 0,
    },
    settings: { notation: 'jp', news: true },
    endingSeen: false,
    last: now || Date.now(),
  };
}

// 強化のレベル。g で始まる id は金強化、それ以外はゼロ強化
export function lvl(s: State, id: string): number {
  return (id[0] === 'g' ? s.gu[id] : s.zu[id]) || 0;
}
