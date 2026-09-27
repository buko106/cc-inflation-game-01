// ゲームのロジック。DOM には触らないので Node からも動かせる。
(function () {
  'use strict';
  const IG = (globalThis.IG = globalThis.IG || {});
  const { D } = IG;
  const { GENS, RULES, ZERO_UPGRADES, GOLD_UPGRADES, ACHIEVEMENTS, PRICES } = IG.data;

  const AUTO_IDS = ZERO_UPGRADES.filter((u) => u.auto).map((u) => u.id);
  const AUTO_TIERS = { aLow: [2, 1, 0], aMid: [5, 4, 3], aHigh: [7, 6] };
  const START_MONEY = [10, 1e3, 1e6, 1e8, 1e12];
  const START_ZEROS = [0, 1e3, 1e6, 1e9];
  const SAVE_VERSION = 1;

  function newState(now) {
    return {
      v: SAVE_VERSION,
      money: D.from(RULES.startMoney),
      gens: GENS.map(() => ({ amt: D.ZERO, bought: 0 })),
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

  // ---- 倍率 ----

  function lvl(s, id) {
    return (id[0] === 'g' ? s.gu[id] : s.zu[id]) || 0;
  }

  function tickBase(s) {
    return RULES.tickBase + 0.025 * lvl(s, 'zTick') + 0.05 * lvl(s, 'gTick');
  }

  function per10(s) {
    return 2 + 0.25 * lvl(s, 'zPer10') + 0.5 * lvl(s, 'gPer10');
  }

  function qeBase(s) {
    return lvl(s, 'zQE') ? 3 : 2;
  }

  function achMult(s) {
    return D.from(1.05).pow(Object.keys(s.ach).length);
  }

  function globalMult(s) {
    let m = D.from(qeBase(s)).pow(s.qe);
    m = m.mul(D.from(3).pow(lvl(s, 'zMult')));
    if (lvl(s, 'zCount')) m = m.mul(Math.pow(1 + s.denoms, 1.5));
    if (lvl(s, 'zZero')) m = m.mul(s.zerosTotal.add(1).pow(0.3));
    m = m.mul(D.from(1000).pow(lvl(s, 'gMult')));
    m = m.mul(s.goldTotal.add(1).pow(2));
    return m.mul(achMult(s));
  }

  function unlockedTiers(s) {
    return Math.min(GENS.length, RULES.qeBaseTiers + s.qe);
  }

  // 毎秒の生産量などをまとめて計算する
  function compute(s) {
    const global = globalMult(s);
    const p10 = D.from(per10(s));
    const tickMult = D.from(tickBase(s)).pow(s.tick).mul(RULES.speed);
    const n = unlockedTiers(s);
    const mults = GENS.map((_, i) => p10.pow(Math.floor(s.gens[i].bought / 10)).mul(global));
    const rates = GENS.map((_, i) => {
      if (i >= n) return D.ZERO;
      const r = s.gens[i].amt.mul(mults[i]).mul(tickMult);
      return i === 0 ? r : r.mul(RULES.tierRate);
    });
    const raw = rates[0];
    rates[0] = softcap(raw);
    return { global, tickMult, mults, rates, n, moneyRate: rates[0], softcapped: rates[0] !== raw };
  }

  // エンディング後は倍率どうしが掛け合わさり、1回の周回のなかで資産の桁数が際限なく増えていく。
  // 毎秒の生産の桁数を抑えて、その暴走を止める
  function softcap(rate) {
    const L = rate.log10();
    if (!(L > RULES.softcapAt)) return rate;
    return D.fromLog10(RULES.softcapAt + Math.pow(L - RULES.softcapAt, RULES.softcapPow));
  }

  // ---- 時間経過 ----

  function step(s, dt) {
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
  function advance(s, sec, maxSteps) {
    if (!(sec > 0)) return;
    const steps = Math.max(1, Math.min(maxSteps || 1000, Math.ceil(sec / 0.05)));
    const dt = sec / steps;
    for (let i = 0; i < steps; i++) step(s, dt);
  }

  // ---- 造幣機の購入 ----

  function unitCost(s, i) {
    const g = GENS[i];
    return D.pow10(g.base + g.inc * Math.floor(s.gens[i].bought / 10));
  }

  function batchSize(s, i) {
    return 10 - (s.gens[i].bought % 10);
  }

  function batchCost(s, i) {
    return unitCost(s, i).mul(batchSize(s, i));
  }

  function pay(s, cost) {
    if (!s.money.gte(cost)) return false;
    s.money = s.money.sub(cost);
    return true;
  }

  function addGens(s, i, n) {
    s.gens[i].amt = s.gens[i].amt.add(n);
    s.gens[i].bought += n;
  }

  function buyOne(s, i) {
    if (i >= unlockedTiers(s) || !pay(s, unitCost(s, i))) return false;
    addGens(s, i, 1);
    return true;
  }

  function buyBatch(s, i) {
    if (i >= unlockedTiers(s)) return false;
    const n = batchSize(s, i);
    if (!pay(s, batchCost(s, i))) return false;
    addGens(s, i, n);
    return true;
  }

  // 買えるだけ買う。10台単位でまとめ買いし、残ったお金で1台ずつ買う
  // 購入の繰り返しの上限。まとめ買いのあとは数回で終わるはずだが、
  // 計算誤差で価格が上がらなくなっても処理が止まる (画面が固まらない) ようにする
  const MAX_REPEAT = 100;

  function repeat(times, fn) {
    let n = 0;
    while (n < times && fn()) n++;
    return n;
  }

  function buyMax(s, i) {
    if (i >= unlockedTiers(s)) return 0;
    const before = s.gens[i].bought;
    if (s.gens[i].bought % 10 !== 0 && !buyBatch(s, i)) {
      repeat(10, () => buyOne(s, i));
      return s.gens[i].bought - before;
    }
    const g = GENS[i];
    // 10台セット j の価格は 10^(1 + base + inc × j)。桁が大きいときは等比級数でまとめて払う
    const jmax = Math.floor((s.money.log10() - 1 - g.base) / g.inc);
    const j = s.gens[i].bought / 10;
    if (jmax - j > 3) {
      const last = jmax - 2;
      const total = D.pow10(1 + g.base + g.inc * last).mul(1 / (1 - Math.pow(10, -g.inc)));
      if (pay(s, total)) addGens(s, i, 10 * (last - j + 1));
    }
    repeat(MAX_REPEAT, () => buyBatch(s, i));
    repeat(10, () => buyOne(s, i));
    return s.gens[i].bought - before;
  }

  function maxAll(s) {
    let bought = 0;
    for (let i = unlockedTiers(s) - 1; i >= 0; i--) bought += buyMax(s, i);
    bought += buyTickMax(s);
    return bought;
  }

  // ---- 印刷速度 ----

  function tickCostExp(t) {
    return RULES.tickCostBase + RULES.tickCostInc * t + RULES.tickCostQuad * t * t;
  }

  function tickCost(s) {
    return D.pow10(tickCostExp(s.tick));
  }

  function buyTick(s) {
    if (!pay(s, tickCost(s))) return false;
    s.tick += 1;
    return true;
  }

  function buyTickMax(s) {
    const before = s.tick;
    // tickCostExp(t) <= log10(資産) を満たす最大の t。1回ごとに価格は10倍以上になるので等比級数で上から抑えられる
    const a = RULES.tickCostQuad;
    const b = RULES.tickCostInc;
    const c = RULES.tickCostBase - s.money.log10();
    const tmax = Math.floor(a > 0 ? (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a) : -c / b);
    if (tmax - s.tick > 3) {
      const last = tmax - 2;
      const total = D.pow10(tickCostExp(last)).mul(1 / (1 - Math.pow(10, -b)));
      if (pay(s, total)) s.tick = last + 1;
    }
    repeat(MAX_REPEAT, () => buyTick(s));
    return s.tick - before;
  }

  // ---- 量的緩和 (造幣機をリセットして次の段を解放、全体を強化) ----

  function qeTier(s) {
    return Math.min(GENS.length - 1, RULES.qeBaseTiers - 1 + s.qe);
  }

  function qeReq(s) {
    return RULES.qeReqBase + Math.max(0, s.qe - (GENS.length - RULES.qeBaseTiers)) * RULES.qeReqStep;
  }

  function canQE(s) {
    return s.gens[qeTier(s)].bought >= qeReq(s);
  }

  function startMoney(s) {
    return D.from(START_MONEY[lvl(s, 'zStart')]);
  }

  function resetMint(s) {
    s.money = startMoney(s);
    s.gens = GENS.map(() => ({ amt: D.ZERO, bought: 0 }));
    s.tick = 0;
  }

  function doQE(s) {
    if (!canQE(s)) return false;
    s.qe += 1;
    resetMint(s);
    return true;
  }

  // ---- デノミ (ゼロを得る) ----

  function denomScale(s) {
    return RULES.denomScale - 2 * lvl(s, 'gExp');
  }

  function zeroGainMult(s) {
    return D.from(2).pow(lvl(s, 'zGain')).mul(D.from(10).pow(lvl(s, 'gZero')));
  }

  function canDenom(s) {
    return s.money.log10() >= RULES.denomAt;
  }

  function rawDenomGain(s) {
    const L = s.money.log10();
    if (L < RULES.denomAt) return D.ZERO;
    return D.fromLog10((L - RULES.denomAt) / denomScale(s)).mul(zeroGainMult(s));
  }

  function denomGain(s) {
    return rawDenomGain(s).floor();
  }

  // 獲得ゼロが1個増える資産
  function nextDenomAt(s) {
    const target = denomGain(s).add(1).div(zeroGainMult(s)).log10();
    return D.fromLog10(RULES.denomAt + Math.max(0, target) * denomScale(s));
  }

  function doDenom(s) {
    if (!canDenom(s)) return false;
    const gain = denomGain(s);
    s.zeros = s.zeros.add(gain);
    s.zerosTotal = s.zerosTotal.add(gain);
    s.denoms += 1;
    const t = s.stats.denomTime;
    if (s.stats.fastestDenom === null || t < s.stats.fastestDenom) s.stats.fastestDenom = t;
    s.stats.history.unshift({ time: t, gain: gain });
    s.stats.history.length = Math.min(s.stats.history.length, 10);
    s.qe = lvl(s, 'zKeepQE') ? 4 : 0;
    resetMint(s);
    s.stats.denomTime = 0;
    s.stats.best = s.money;
    return true;
  }

  function autoDenomReady(s) {
    if (!canDenom(s)) return false;
    const a = s.autoDenom;
    if (a.mode === 'time') return s.stats.denomTime >= Number(a.value || 0);
    return denomGain(s).gte(D.from(a.value || '1').max(1));
  }

  // ---- 金本位制 (金塊を得る) ----

  function canGold(s) {
    return s.money.log10() >= RULES.goldAt;
  }

  function goldGain(s) {
    const L = s.money.log10();
    if (L < RULES.goldAt) return D.ZERO;
    return D.fromLog10((L - RULES.goldAt) / RULES.goldScale).floor().max(1);
  }

  function doGold(s) {
    if (!canGold(s)) return false;
    const gain = goldGain(s);
    s.gold = s.gold.add(gain);
    s.goldTotal = s.goldTotal.add(gain);
    s.golds += 1;
    const keep = {};
    for (const id of AUTO_IDS) if (s.zu[id]) keep[id] = s.zu[id];
    s.zu = keep;
    s.zeros = D.from(START_ZEROS[lvl(s, 'gStart')]);
    s.zerosTotal = s.zeros;
    s.qe = 0;
    resetMint(s);
    s.stats.denomTime = 0;
    s.stats.goldTime = 0;
    s.stats.best = s.money;
    return true;
  }

  // ---- 強化 ----

  const UPGRADES = Object.fromEntries(
    ZERO_UPGRADES.map((u) => [u.id, { ...u, layer: 'zero' }]).concat(
      GOLD_UPGRADES.map((u) => [u.id, { ...u, layer: 'gold' }]),
    ),
  );

  function upgCost(s, id) {
    return D.from(UPGRADES[id].cost(lvl(s, id)));
  }

  function upgMaxed(s, id) {
    return lvl(s, id) >= UPGRADES[id].max;
  }

  function canBuyUpg(s, id) {
    const bank = UPGRADES[id].layer === 'gold' ? s.gold : s.zeros;
    return !upgMaxed(s, id) && bank.gte(upgCost(s, id));
  }

  function buyUpg(s, id) {
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

  // ---- 自動化 ----

  function autoActive(s, id) {
    return lvl(s, id) > 0 && s.autoOn[id] !== false;
  }

  function runAuto(s) {
    for (const id of ['aHigh', 'aMid', 'aLow']) {
      if (autoActive(s, id)) for (const i of AUTO_TIERS[id]) buyMax(s, i);
    }
    if (autoActive(s, 'aTick')) buyTickMax(s);
    if (autoActive(s, 'aQE') && canQE(s)) doQE(s);
    if (autoActive(s, 'aDenom') && autoDenomReady(s)) doDenom(s);
  }

  // ---- 物価 ----

  function priceIndex(s) {
    return s.stats.best.max(10).div(10).pow(0.92);
  }

  function price(s, id) {
    const item = PRICES.find((p) => p.id === id);
    return priceIndex(s).mul(item.base);
  }

  function buyBread(s) {
    if (!pay(s, price(s, 'bread'))) return false;
    s.stats.breads += 1;
    return true;
  }

  // 資産が2倍になるまでの秒数 (いまの生産量のまま)
  function doublingTime(s, c) {
    const rate = (c || compute(s)).moneyRate;
    if (rate.isZero()) return Infinity;
    return s.money.div(rate).toNumber();
  }

  // ---- 実績 ----

  function checkAchievements(s, now) {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
      if (!s.ach[a.id] && a.check(s)) {
        s.ach[a.id] = now || Date.now();
        unlocked.push(a);
      }
    }
    return unlocked;
  }

  function reachedEnd(s) {
    return s.money.log10() >= RULES.endExp;
  }

  // ---- セーブ ----

  function serialize(s) {
    return JSON.stringify(s);
  }

  function deserialize(json) {
    const raw = typeof json === 'string' ? JSON.parse(json) : json;
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.gens)) throw new Error('セーブデータの形式が違います');
    const s = newState(raw.last);
    const d = (x, fallback) => (x === undefined || x === null ? fallback : D.from(x));
    const n = (x, fallback) => (Number.isFinite(x) ? x : fallback);
    s.money = d(raw.money, s.money);
    s.gens = GENS.map((_, i) => {
      const g = raw.gens[i] || {};
      return { amt: d(g.amt, D.ZERO), bought: n(g.bought, 0) };
    });
    s.tick = n(raw.tick, 0);
    s.qe = n(raw.qe, 0);
    s.zeros = d(raw.zeros, D.ZERO);
    s.zerosTotal = d(raw.zerosTotal, D.ZERO);
    s.denoms = n(raw.denoms, 0);
    s.zu = { ...(raw.zu || {}) };
    s.gold = d(raw.gold, D.ZERO);
    s.goldTotal = d(raw.goldTotal, D.ZERO);
    s.golds = n(raw.golds, 0);
    s.gu = { ...(raw.gu || {}) };
    Object.assign(s.autoOn, raw.autoOn || {});
    if (raw.autoDenom) s.autoDenom = { mode: raw.autoDenom.mode === 'time' ? 'time' : 'gain', value: String(raw.autoDenom.value ?? '1') };
    s.ach = { ...(raw.ach || {}) };
    const rs = raw.stats || {};
    s.stats.played = n(rs.played, 0);
    s.stats.denomTime = n(rs.denomTime, 0);
    s.stats.goldTime = n(rs.goldTime, 0);
    s.stats.best = d(rs.best, s.money);
    s.stats.bestEver = d(rs.bestEver, s.money);
    s.stats.totalEver = d(rs.totalEver, D.ZERO);
    s.stats.fastestDenom = Number.isFinite(rs.fastestDenom) ? rs.fastestDenom : null;
    s.stats.history = (rs.history || []).slice(0, 10).map((h) => ({ time: n(h.time, 0), gain: d(h.gain, D.ZERO) }));
    s.stats.breads = n(rs.breads, 0);
    Object.assign(s.settings, raw.settings || {});
    s.endingSeen = !!raw.endingSeen;
    s.last = n(raw.last, Date.now());
    return s;
  }

  // エクスポート用。日本語を含んでも壊れないよう UTF-8 → base64
  function exportSave(s) {
    const bytes = new TextEncoder().encode(serialize(s));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function importSave(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith('{')) return deserialize(trimmed);
    const bin = atob(trimmed);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return deserialize(new TextDecoder().decode(bytes));
  }

  IG.game = {
    AUTO_IDS,
    UPGRADES,
    newState,
    lvl,
    tickBase,
    per10,
    qeBase,
    achMult,
    globalMult,
    unlockedTiers,
    compute,
    step,
    advance,
    unitCost,
    batchSize,
    batchCost,
    buyOne,
    buyBatch,
    buyMax,
    maxAll,
    tickCost,
    buyTick,
    buyTickMax,
    qeTier,
    qeReq,
    canQE,
    doQE,
    startMoney,
    denomScale,
    canDenom,
    rawDenomGain,
    denomGain,
    nextDenomAt,
    doDenom,
    canGold,
    goldGain,
    doGold,
    upgCost,
    upgMaxed,
    canBuyUpg,
    buyUpg,
    autoActive,
    priceIndex,
    price,
    buyBread,
    doublingTime,
    checkAchievements,
    reachedEnd,
    serialize,
    deserialize,
    exportSave,
    importSave,
  };
})();
