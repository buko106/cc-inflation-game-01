const test = require('node:test');
const assert = require('node:assert/strict');
const IG = require('./load');

const { D, game: G } = IG;

// 金本位制を何度も回したあとの強い状態 (量的緩和の自動化だけオフ)
function lateGameState() {
  const s = G.newState(0);
  s.golds = 20;
  s.gold = D.from('1e30');
  s.goldTotal = D.from('1e30');
  s.gu = { gMult: 150, gZero: 65, gInterest: 1, gExp: 3, gPer10: 4, gTick: 5, gStart: 3 };
  s.zu = { zCount: 1, zMult: 540, zZero: 1, zPer10: 4, zTick: 5, zQE: 1, zStart: 4, zKeepQE: 1, zGain: 400 };
  for (const id of G.AUTO_IDS) {
    s.zu[id] = 1;
    s.autoOn[id] = true;
  }
  s.autoOn.aQE = false;
  s.denoms = 400;
  s.zeros = D.from('1e700');
  s.zerosTotal = D.from('1e700');
  s.qe = 4;
  return s;
}

function timed(fn) {
  const t0 = Date.now();
  fn();
  return Date.now() - t0;
}

test('桁外れの資産でも購入処理がすぐ終わる', () => {
  for (const exp of [1e6, 1e12, 1e15, 1e16, 1e17, 1e20, 1e300]) {
    const s = G.newState(0);
    s.qe = 4;
    s.money = D.fromLog10(exp);
    assert.ok(timed(() => G.maxAll(s)) < 200, `maxAll at e${exp}`);
    s.money = D.fromLog10(exp);
    for (const id of G.AUTO_IDS) s.zu[id] = 1;
    assert.ok(timed(() => G.step(s, 0.05)) < 200, `step at e${exp}`);
  }
});

test('指数は上限で止まり、それを超えない', () => {
  assert.equal(D.fromLog10(1e20).e, D.MAX_EXP);
  assert.equal(D.from('1e100000000000000000000').e, D.MAX_EXP);
  assert.ok(D.MAX.mul(D.MAX).eq(D.MAX));
  assert.ok(D.MAX.add(D.MAX).eq(D.MAX));
});

test('壊れた (桁外れの) セーブを読み込んでも固まらない', () => {
  const raw = JSON.parse(G.serialize(lateGameState()));
  raw.money = '1e100000000000000000';
  raw.gens = raw.gens.map(() => ({ amt: '1e50000000000000000', bought: 3e16 }));
  raw.tick = 1e11;
  const s = G.deserialize(JSON.stringify(raw));
  assert.ok(s.money.e <= D.MAX_EXP);
  assert.ok(timed(() => G.advance(s, 3600, 2000)) < 5000);
});

test('自動化を全部オンにしても資産が暴走しない (60秒)', () => {
  const s = lateGameState();
  let maxLog = 0;
  const ms = timed(() => {
    for (let k = 0; k < 1200; k++) {
      G.step(s, 0.05);
      maxLog = Math.max(maxLog, s.money.log10());
    }
  });
  assert.ok(ms < 3000, `60秒分の進行に ${ms}ms`);
  assert.ok(maxLog < 1e5, `資産が e${maxLog} まで暴走した`);
});
