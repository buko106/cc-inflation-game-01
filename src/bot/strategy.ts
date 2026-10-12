// バランス調整用 bot の戦略。コアの関数だけを使い、プレイヤーの操作をまねる
import * as G from '../core';

export interface Strategy {
  name: string;
  description: string;
  // 何秒 (ゲーム内時間) ごとに操作するか。人が画面を見る間隔のつもり
  actEvery: number;
  // 開始時に一度だけ呼ばれる
  setup?(s: G.State): void;
  // actEvery 秒ごとに呼ばれる。ここでコアの関数を呼んで状態を変える
  act(s: G.State): void;
}

// デノミ・金本位制の時機
// - asap: 1個でももらえればすぐ
// - double: 累計が倍以上になるまで待つ (手持ちは強化に使ってしまうので累計と比べる)
// - never: しない (デノミなら自動デノミにまかせる)
export type ResetRule = 'asap' | 'double' | 'never';

export interface PlayStyle {
  // 自動化 (aLow など) を買うか
  buyAutomation: boolean;
  denom: ResetRule;
  gold: ResetRule;
}

// 1回の操作で強化を買う回数の上限 (無限ループよけ)
const MAX_UPGRADE_BUYS = 200;

// 買える強化のうち一番安いものから買っていく。ゼロと金塊は別の通貨なので、通貨ごとに比べる
export function buyCheapestUpgrades(s: G.State, allow: (u: G.Upgrade) => boolean): number {
  let bought = 0;
  for (const layer of ['zero', 'gold'] as const) {
    const candidates = Object.values(G.UPGRADES).filter((u) => u.layer === layer && allow(u));
    while (bought < MAX_UPGRADE_BUYS) {
      let best: G.Upgrade | null = null;
      let bestCost = G.D.ZERO;
      for (const u of candidates) {
        if (!G.canBuyUpg(s, u.id)) continue;
        const cost = G.upgCost(s, u.id);
        if (!best || cost.lt(bestCost)) {
          best = u;
          bestCost = cost;
        }
      }
      if (!best || !G.buyUpg(s, best.id)) break;
      bought++;
    }
  }
  return bought;
}

function ready(rule: ResetRule, can: boolean, gain: () => G.D, have: G.D): boolean {
  if (rule === 'never' || !can) return false;
  return gain().gte(rule === 'asap' ? 1 : have.max(1));
}

// 遊び方の設定から、毎回の操作を組み立てる
export function playBy(style: PlayStyle): (s: G.State) => void {
  return (s) => {
    if (ready(style.gold, G.canGold(s), () => G.goldGain(s), s.goldTotal)) G.doGold(s);
    else if (ready(style.denom, G.canDenom(s), () => G.denomGain(s), s.zerosTotal)) G.doDenom(s);
    buyCheapestUpgrades(s, (u) => style.buyAutomation || !u.auto);
    while (G.canQE(s)) G.doQE(s);
    G.maxAll(s);
  };
}

export const STRATEGIES: readonly Strategy[] = [
  {
    name: 'active',
    description: '毎ティック操作し、ゼロ・金塊が倍になるまで待ってリセット。自動化も買う',
    actEvery: 0.05,
    setup(s) {
      // デノミは bot が判断する
      s.autoOn.aDenom = false;
    },
    act: playBy({ buyAutomation: true, denom: 'double', gold: 'double' }),
  },
  {
    name: 'normal',
    description: '1秒に1回操作する、ふつうに画面に張りついている人。自動化も買う',
    actEvery: 1,
    setup(s) {
      s.autoOn.aDenom = false;
    },
    act: playBy({ buyAutomation: true, denom: 'double', gold: 'double' }),
  },
  {
    name: 'rush',
    description: '毎ティック操作し、デノミ・金本位制はできたらすぐする',
    actEvery: 0.05,
    setup(s) {
      s.autoOn.aDenom = false;
    },
    act: playBy({ buyAutomation: true, denom: 'asap', gold: 'asap' }),
  },
  {
    name: 'casual',
    description: '10秒に1回画面を見て操作する。デノミはゼロが倍になるまで待つ',
    actEvery: 10,
    setup(s) {
      s.autoOn.aDenom = false;
    },
    act: playBy({ buyAutomation: true, denom: 'double', gold: 'double' }),
  },
  {
    name: 'idle',
    description: '1分に1回だけ見る。デノミは自動デノミ (60秒ごと) にまかせる',
    actEvery: 60,
    act: (s) => {
      // 自動デノミを買うまでは自分でする
      playBy({ buyAutomation: true, denom: G.lvl(s, 'aDenom') ? 'never' : 'double', gold: 'double' })(s);
    },
  },
  {
    name: 'no-automation',
    description: '自動化を一切買わず、1秒に1回手で操作する',
    actEvery: 1,
    act: playBy({ buyAutomation: false, denom: 'double', gold: 'double' }),
  },
];

export function findStrategy(name: string): Strategy | undefined {
  return STRATEGIES.find((st) => st.name === name);
}
