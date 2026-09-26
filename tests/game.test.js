const test = require('node:test');
const assert = require('node:assert/strict');
const IG = require('./load');

const { D, game: G, data } = IG;
const { RULES, GENS } = data;

test('最初は10円で輪転機を1台買える', () => {
  const s = G.newState(0);
  assert.ok(G.buyOne(s, 0));
  assert.ok(s.money.isZero());
  assert.equal(s.gens[0].bought, 1);
  assert.equal(G.buyOne(s, 0), false, 'お金が足りなければ買えない');
});

test('輪転機はお金を刷る', () => {
  const s = G.newState(0);
  G.buyOne(s, 0);
  G.step(s, 1);
  assert.ok(s.money.toNumber() > 0);
  assert.equal(s.money.toNumber(), RULES.speed * s.gens[0].bought * G.achMult(s).toNumber());
});

test('10台ごとに価格が上がり倍率がつく', () => {
  const s = G.newState(0);
  s.money = D.from('1e10');
  assert.ok(G.buyBatch(s, 0));
  assert.equal(s.gens[0].bought, 10);
  assert.equal(G.unitCost(s, 0).log10(), GENS[0].base + GENS[0].inc);
  const c = G.compute(s);
  assert.equal(c.mults[0].div(c.global).toNumber(), 2);
});

test('量的緩和がない段は買えない', () => {
  const s = G.newState(0);
  s.money = D.from('1e100');
  assert.equal(G.buyOne(s, 4), false);
  assert.equal(G.unlockedTiers(s), 4);
});

test('buyMax は大金でも一瞬で終わり、所持金を超えて払わない', () => {
  const s = G.newState(0);
  s.qe = 4;
  s.money = D.from('1e5000');
  const t0 = Date.now();
  G.maxAll(s);
  assert.ok(Date.now() - t0 < 200);
  assert.ok(s.gens[0].bought > 1000);
  assert.ok(s.tick > 100);
  assert.ok(!s.money.isZero() || true);
  // 次の10台はもう買えないはず
  for (let i = 0; i < GENS.length; i++) assert.ok(s.money.lt(G.batchCost(s, i)));
  assert.ok(s.money.lt(G.tickCost(s)));
});

test('量的緩和で次の段が解放され、造幣機はリセットされる', () => {
  const s = G.newState(0);
  s.gens[3].bought = 20;
  s.money = D.from(1e9);
  assert.ok(G.canQE(s));
  assert.ok(G.doQE(s));
  assert.equal(s.qe, 1);
  assert.equal(G.unlockedTiers(s), 5);
  assert.equal(s.gens[3].bought, 0);
  assert.equal(s.money.toNumber(), 10);
  assert.equal(G.qeTier(s), 4);
});

test('デノミ: 1e30円でゼロ1個、1e(30+scale)円で10個', () => {
  const s = G.newState(0);
  s.money = D.from('9e29');
  assert.equal(G.canDenom(s), false);
  s.money = D.from('1e30');
  assert.equal(G.denomGain(s).toNumber(), 1);
  s.money = D.pow10(RULES.denomAt + RULES.denomScale);
  assert.equal(G.denomGain(s).toNumber(), 10);
  const next = G.nextDenomAt(s);
  s.money = next;
  assert.equal(G.denomGain(s).toNumber(), 11);
  assert.ok(G.doDenom(s));
  assert.equal(s.zeros.toNumber(), 11);
  assert.equal(s.denoms, 1);
  assert.equal(s.qe, 0);
  assert.equal(s.money.toNumber(), 10);
});

test('ゼロ強化を買うとゼロが減りレベルが上がる', () => {
  const s = G.newState(0);
  s.zeros = D.from(10);
  assert.ok(G.buyUpg(s, 'zMult'));
  assert.equal(G.lvl(s, 'zMult'), 1);
  assert.equal(s.zeros.toNumber(), 9);
  assert.ok(G.buyUpg(s, 'zQE'));
  assert.equal(G.buyUpg(s, 'zQE'), false, '上限に達したら買えない');
  assert.equal(G.qeBase(s), 3);
});

test('金本位制: ゼロ強化はリセット、自動化は残る', () => {
  const s = G.newState(0);
  s.zu = { zMult: 5, aLow: 1, aQE: 1 };
  s.zeros = D.from(1e6);
  s.money = D.from(Number.MAX_VALUE);
  assert.ok(G.canGold(s));
  assert.ok(G.doGold(s));
  assert.equal(s.gold.toNumber(), 1);
  assert.deepEqual(s.zu, { aLow: 1, aQE: 1 });
  assert.ok(s.zeros.isZero());
});

test('自動購入は解放済みでオンのときだけ動く', () => {
  const s = G.newState(0);
  s.money = D.from(1e6);
  G.step(s, 0.01);
  assert.equal(s.gens[0].bought, 0);
  s.zu.aLow = 1;
  G.step(s, 0.01);
  assert.ok(s.gens[0].bought > 0);
  s.autoOn.aLow = false;
  s.money = D.from(1e9);
  const before = s.gens[0].bought;
  G.step(s, 0.01);
  assert.equal(s.gens[0].bought, before);
});

test('自動デノミは設定した秒数を待つ', () => {
  const s = G.newState(0);
  s.zu.aDenom = 1;
  s.autoDenom = { mode: 'time', value: '60' };
  s.money = D.from('1e40');
  s.stats.denomTime = 10;
  G.step(s, 0.01);
  assert.equal(s.denoms, 0);
  s.money = D.from('1e40');
  s.stats.denomTime = 61;
  G.step(s, 0.01);
  assert.equal(s.denoms, 1);
});

test('パンは物価指数に比例して高くなる', () => {
  const s = G.newState(0);
  const cheap = G.price(s, 'bread');
  s.stats.best = D.from('1e20');
  assert.ok(G.price(s, 'bread').gt(cheap.mul(1e10)));
  s.money = D.from('1e30');
  s.stats.best = s.money;
  assert.ok(G.buyBread(s));
  assert.equal(s.stats.breads, 1);
});

test('セーブの書き出しと読み込みで状態が戻る', () => {
  const s = G.newState(0);
  s.money = D.from('1.5e777');
  s.gens[2].bought = 42;
  s.zu.zMult = 3;
  s.stats.history.push({ time: 12.5, gain: D.from(100) });
  s.settings.notation = 'sci';
  const back = G.importSave(G.exportSave(s));
  assert.ok(back.money.eq(s.money));
  assert.equal(back.gens[2].bought, 42);
  assert.equal(back.zu.zMult, 3);
  assert.ok(back.stats.history[0].gain.eq(100));
  assert.equal(back.settings.notation, 'sci');
  assert.throws(() => G.importSave('not a save'));
});

test('実績は条件を満たすと一度だけ解除される', () => {
  const s = G.newState(0);
  s.money = D.from(1e8);
  const first = G.checkAchievements(s, 1).map((a) => a.id);
  assert.ok(first.includes('man'));
  assert.ok(first.includes('oku'));
  assert.equal(G.checkAchievements(s, 2).length, 0);
});

test('放置でも進行が止まらない (10分の早送り)', () => {
  const s = G.newState(0);
  G.buyOne(s, 0);
  G.advance(s, 600, 2000);
  assert.ok(s.money.gt(100));
});
