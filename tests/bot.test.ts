import { assert, test } from 'vitest';
import * as G from '../src/core';
import { MILESTONES, runStrategy } from '../src/bot/run';
import { buyCheapestUpgrades, findStrategy, STRATEGIES } from '../src/bot/strategy';

test('戦略の名前は重複しない', () => {
  const names = STRATEGIES.map((st) => st.name);
  assert.strictEqual(new Set(names).size, names.length);
  assert.ok(STRATEGIES.length >= 2);
});

test('同じ戦略を2回走らせると同じ結果になる', () => {
  const st = findStrategy('active')!;
  const a = runStrategy(st, { maxSec: 300 });
  const b = runStrategy(st, { maxSec: 300 });
  assert.deepStrictEqual(a, b);
});

test('active は10分以内に最初のデノミに届く', () => {
  const r = runStrategy(findStrategy('active')!, { maxSec: 600 });
  assert.ok(r.times.denom !== null && r.times.denom < 600);
  assert.ok(r.denoms > 0);
});

test('到達点に届いたらそこで止まり、届かなければ上限まで進める', () => {
  const r = runStrategy(findStrategy('active')!, { maxSec: 60 });
  assert.ok(Math.abs(r.simulated - 60) < 0.1);
  for (const m of MILESTONES) assert.strictEqual(r.times[m.id], null);
});

test('強化は安いものから、許可したものだけ買う', () => {
  const s = G.newState(1);
  s.zeros = G.D.from(5);
  buyCheapestUpgrades(s, (u) => !u.auto);
  for (const id of G.AUTO_IDS) assert.strictEqual(G.lvl(s, id), 0);
  // 1個のゼロで買えるもの (札束ブースト・デノミの記憶) が先に買われる
  assert.strictEqual(G.lvl(s, 'zMult'), 1);
  assert.strictEqual(G.lvl(s, 'zCount'), 1);
});
