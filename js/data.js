// ゲームの定数・名前・文章。数値の調整はここで行う。
(function () {
  'use strict';
  const IG = (globalThis.IG = globalThis.IG || {});
  const { D } = IG;

  // 造幣機 8段階。base / inc は 10 の指数。
  // 1台の価格 = 10^(base + inc × floor(購入数 / 10))
  const GENS = [
    { numeral: '壱', name: '輪転機', flavor: 'お札を刷る。まずはここから。', base: 1, inc: 3 },
    { numeral: '弐', name: '印刷工場', flavor: '輪転機を量産する工場。', base: 2, inc: 4 },
    { numeral: '参', name: '造幣局', flavor: '印刷工場を建てる役所。', base: 4, inc: 5 },
    { numeral: '肆', name: '中央銀行', flavor: '造幣局を次々と設立する。', base: 6, inc: 6 },
    { numeral: '伍', name: '財務省', flavor: '中央銀行を量産する予算を組む。', base: 9, inc: 8 },
    { numeral: '陸', name: '惑星準備銀行', flavor: '惑星まるごと財務省。', base: 13, inc: 10 },
    { numeral: '漆', name: '銀河通貨基金', flavor: '銀河系の星々に銀行を配る。', base: 18, inc: 12 },
    { numeral: '捌', name: '多元宇宙造幣局', flavor: '別の宇宙からも資金を刷る。', base: 24, inc: 15 },
  ];

  const RULES = {
    startMoney: 10,
    // 全体の時間の速さ
    speed: 3,
    // 上位の造幣機が下位の造幣機を生み出す速さ (輪転機→円は 1.0)
    tierRate: 1,
    // 印刷速度 t 回目の価格 = 10^(tickCostBase + tickCostInc × t + tickCostQuad × t²)
    tickCostBase: 3,
    tickCostInc: 1,
    tickCostQuad: 0.01,
    tickBase: 1.125,
    qeBaseTiers: 4,
    qeReqBase: 20,
    qeReqStep: 15,
    // デノミ: 10^denomAt 円でゼロ 1 個。以降 10^denomScale 倍ごとに 10 倍
    denomAt: 30,
    denomScale: 20,
    // 金本位制: Number.MAX_VALUE を超えたら金塊 1 個。以降 10^goldScale 倍ごとに 10 倍
    goldAt: Math.log10(Number.MAX_VALUE),
    goldScale: 100,
    // この金額に到達するとエンディング
    endExp: 3000,
  };

  const geo = (base, ratio) => (l) => D.from(ratio).pow(l).mul(base);

  const ZERO_UPGRADES = [
    { id: 'zMult', name: '札束ブースト', desc: (l) => `全造幣機の生産 ×3 (いま ×${fmtPow(3, l)})`, max: Infinity, cost: geo(1, 6) },
    { id: 'zCount', name: 'デノミの記憶', desc: () => 'デノミ回数に応じて全造幣機を強化 (×(1+回数)^1.5)', max: 1, cost: () => D.from(1) },
    { id: 'zZero', name: 'ゼロの信用', desc: () => '累計ゼロ数に応じて全造幣機を強化 (×(1+累計ゼロ)^0.3)', max: 1, cost: () => D.from(3) },
    { id: 'zPer10', name: '十台揃え', desc: (l) => `10台ごとの倍率 +0.25 (いま ×${(2 + 0.25 * l).toFixed(2)})`, max: 4, cost: geo(2, 3) },
    { id: 'zTick', name: '高速輪転', desc: (l) => `印刷速度1回ごとの倍率 +0.025 (いま ×${(1.125 + 0.025 * l).toFixed(3)})`, max: 5, cost: geo(2, 3) },
    { id: 'zQE', name: '異次元緩和', desc: () => '量的緩和1回ごとの倍率 ×2 → ×3', max: 1, cost: () => D.from(8) },
    { id: 'zStart', name: '初期資本', desc: (l) => `リセット後の開始資金を増やす (いま ${['10', '1000', '100万', '1億', '1兆'][l]}円)`, max: 4, cost: geo(4, 5) },
    { id: 'zKeepQE', name: '政策の継続', desc: () => 'デノミ後も量的緩和4回の状態から再開', max: 1, cost: () => D.from(20) },
    { id: 'zGain', name: 'ゼロ増刷', desc: (l) => `デノミで得るゼロ ×2 (いま ×${fmtPow(2, l)})`, max: Infinity, cost: geo(25, 10) },
    { id: 'aLow', name: '自動購入 壱〜参', desc: () => '輪転機・印刷工場・造幣局を自動で買う', max: 1, cost: () => D.from(1), auto: true },
    { id: 'aMid', name: '自動購入 肆〜陸', desc: () => '中央銀行・財務省・惑星準備銀行を自動で買う', max: 1, cost: () => D.from(4), auto: true },
    { id: 'aHigh', name: '自動購入 漆・捌', desc: () => '銀河通貨基金・多元宇宙造幣局を自動で買う', max: 1, cost: () => D.from(12), auto: true },
    { id: 'aTick', name: '自動 印刷速度', desc: () => '印刷速度を自動で上げる', max: 1, cost: () => D.from(6), auto: true },
    { id: 'aQE', name: '自動 量的緩和', desc: () => '条件を満たしたら自動で量的緩和する', max: 1, cost: () => D.from(30), auto: true },
    { id: 'aDenom', name: '自動デノミ', desc: () => '設定した条件で自動的にデノミする', max: 1, cost: () => D.from(500), auto: true },
  ];

  const GOLD_UPGRADES = [
    { id: 'gMult', name: '金の輝き', desc: (l) => `全造幣機 ×1000 (いま ×${fmtPow(1000, l)})`, max: Infinity, cost: geo(1, 2) },
    { id: 'gZero', name: '金為替', desc: (l) => `デノミで得るゼロ ×10 (いま ×${fmtPow(10, l)})`, max: Infinity, cost: geo(1, 3) },
    { id: 'gPer10', name: '純金の輪転機', desc: (l) => `10台ごとの倍率 +0.5 (いま +${(0.5 * l).toFixed(1)})`, max: 4, cost: geo(2, 4) },
    { id: 'gTick', name: '金メッキの版', desc: (l) => `印刷速度1回ごとの倍率 +0.05 (いま +${(0.05 * l).toFixed(2)})`, max: 5, cost: geo(2, 3) },
    { id: 'gStart', name: '準備金', desc: (l) => `金本位制の後、ゼロを持って始める (いま ${['0', '1000', '100万', '10億'][l]})`, max: 3, cost: geo(3, 5) },
    { id: 'gExp', name: 'デノミ改革', desc: (l) => `ゼロが10倍になる資産の倍率を下げる (いま 10^${20 - 2 * l} 倍ごと)`, max: 3, cost: geo(5, 8) },
    { id: 'gInterest', name: '金利生活', desc: () => 'いまデノミで得られるゼロの1%を毎秒受け取る', max: 1, cost: () => D.from(15) },
  ];

  function fmtPow(base, l) {
    return IG.format(D.from(base).pow(l));
  }

  // 実績。check(s) が真になったら解除。解除数に応じて全造幣機 ×1.05^n
  const ACHIEVEMENTS = [
    { id: 'first', name: '輪転機、始動', desc: '輪転機を1台買う', check: (s) => s.gens[0].bought >= 1 },
    { id: 'man', name: '一万円札', desc: '1万円を持つ', check: (s) => s.money.gte(1e4) },
    { id: 'oku', name: '億り人', desc: '1億円を持つ', check: (s) => s.money.gte(1e8) },
    { id: 'cho', name: '国家予算級', desc: '1兆円を持つ', check: (s) => s.money.gte(1e12) },
    { id: 'zim', name: 'ジンバブエ超え', desc: '100兆円を持つ (2009年の100兆ジンバブエドル札)', check: (s) => s.money.gte(1e14) },
    { id: 'kei', name: '京の都', desc: '1京円を持つ', check: (s) => s.money.gte(1e16) },
    { id: 'hun', name: 'ペンゲーの記憶', desc: '1垓円を持つ (1946年ハンガリーの1垓ペンゲー札)', check: (s) => s.money.gte(1e20) },
    { id: 'tier8', name: '多元宇宙へ', desc: '多元宇宙造幣局を1台買う', check: (s) => s.gens[7].bought >= 1 },
    { id: 'qe1', name: '量的緩和', desc: '量的緩和を1回する', check: (s) => s.qe >= 1 || s.denoms > 0 || s.golds > 0 },
    { id: 'qe8', name: '異次元の緩和', desc: '量的緩和を8回する', check: (s) => s.qe >= 8 },
    { id: 'bread', name: 'パンが買えた', desc: 'パンを1斤買う', check: (s) => s.stats.breads >= 1 },
    { id: 'denom1', name: 'ゼロを消せ', desc: 'デノミを1回する', check: (s) => s.denoms >= 1 || s.golds > 0 },
    { id: 'denom10', name: 'デノミ常習犯', desc: 'デノミを10回する', check: (s) => s.denoms >= 10 || s.golds > 0 },
    { id: 'fast', name: '電光石火のデノミ', desc: '60秒以内にデノミする', check: (s) => s.stats.fastestDenom !== null && s.stats.fastestDenom <= 60 },
    { id: 'tick100', name: '輪転機の悲鳴', desc: '印刷速度を100回上げる', check: (s) => s.tick >= 100 },
    { id: 'muryo', name: '数詞の果て', desc: '1無量大数円を持つ。日本語の数詞はここまで', check: (s) => s.money.gte('1e68') },
    { id: 'googol', name: 'グーゴル円', desc: '1e100円を持つ', check: (s) => s.money.gte('1e100') },
    { id: 'zero1k', name: 'ゼロ長者', desc: 'ゼロを累計1000個得る', check: (s) => s.zerosTotal.gte(1000) || s.golds > 0 },
    { id: 'autoAll', name: '全自動造幣', desc: '自動化をすべて買う', check: (s) => ['aLow', 'aMid', 'aHigh', 'aTick', 'aQE', 'aDenom'].every((id) => s.zu[id] >= 1) },
    { id: 'maxval', name: 'Number.MAX_VALUE', desc: '1.8e308円を持つ。JavaScriptの数値の限界', check: (s) => s.money.log10() >= RULES.goldAt },
    { id: 'gold1', name: '金本位制', desc: '金本位制に移行する', check: (s) => s.golds >= 1 },
    { id: 'e1000', name: '千桁の札', desc: '1e1000円を持つ', check: (s) => s.money.gte('1e1000') },
    { id: 'gold100', name: '金の延べ棒', desc: '金塊を累計100個得る', check: (s) => s.goldTotal.gte(100) },
    { id: 'end', name: 'インフレの果て', desc: `1e${RULES.endExp}円を持つ`, check: (s) => s.money.log10() >= RULES.endExp },
  ];

  // 物価。基準価格 × 物価指数。物価指数は資産の最高額にほぼ比例して上がる
  const PRICES = [
    { id: 'coffee', name: '缶コーヒー', base: 130 },
    { id: 'bread', name: 'パン1斤', base: 300 },
    { id: 'ramen', name: 'ラーメン1杯', base: 900 },
  ];

  // ニュース。when(s) が真のものからランダムに流す。text は文字列か関数
  const NEWS = [
    { when: () => true, text: '速報: 自販機のジュースが150円から155円に値上げ。「誤差の範囲」と専門家' },
    { when: () => true, text: '日銀総裁「インフレ目標2%は達成した」。実際の値は非公表' },
    { when: () => true, text: '財布メーカー、無限に伸びる財布の開発に着手' },
    { when: () => true, text: 'お年玉の相場、今年も過去最高を更新' },
    { when: () => true, text: '街の声「給料日に買い物しないと損をする気がする」' },
    { when: (s) => s.money.gte(1e8), text: '輪転機メーカーの株価、ストップ高が続く' },
    { when: (s) => s.money.gte(1e12), text: 'パン屋、値札の桁が足りず手書きに移行' },
    { when: (s) => s.money.gte(1e14), text: 'ジンバブエ中央銀行、あなたへの弟子入りを志願' },
    { when: (s) => s.money.gte(1e16), text: 'お釣りの受け取りにトラックが必要に。運送業界が好景気' },
    { when: (s) => s.money.gte(1e20), text: '1946年のハンガリーでは物価が15時間ごとに2倍になった。あなたの国ではもっと速い' },
    { when: (s) => s.money.gte(1e24), text: '政府、「1秭円札」の発行を決定。肖像は輪転機' },
    { when: (s) => s.money.gte(1e28), text: '経済学者「これはもう数字の問題ではない。哲学の問題だ」' },
    { when: (s) => s.qe >= 1, text: '量的緩和を実施。市場関係者「緩和の意味を辞書で引き直している」' },
    { when: (s) => s.qe >= 5, text: '「異次元の緩和」が比喩ではなくなる。財務省が多元宇宙に出張所を開設' },
    { when: (s) => s.denoms >= 1, text: 'デノミ実施。国民、新しいお札の「0」の少なさに戸惑う' },
    { when: (s) => s.denoms >= 1, text: '回収された旧紙幣、断熱材として再利用へ' },
    { when: (s) => s.denoms >= 5, text: '国民の9割「デノミ前の値段を覚えていない」' },
    { when: (s) => s.money.gte('1e52'), text: '恒河沙はガンジス川の砂の数。すでにあなたの預金残高のほうが多い' },
    { when: (s) => s.money.gte('1e68'), text: '無量大数を突破。国語審議会、新しい数詞の募集を開始' },
    { when: (s) => s.money.gte('1e100'), text: 'グーゴル円を達成。ある検索エンジンの社名の由来になった数です' },
    { when: (s) => s.money.gte('1e200'), text: '観測可能な宇宙の原子の数 (約1e80) を、預金の桁数がとうに超えた' },
    { when: (s) => s.money.log10() >= 300, text: 'JavaScriptの Number 型、もうすぐ限界。技術者が冷や汗' },
    { when: (s) => s.golds >= 1, text: '金本位制に復帰。金庫の前に長蛇の列' },
    { when: (s) => s.golds >= 1, text: '金価格が急騰。いや、円が暴落しているだけかもしれない' },
    { when: (s) => s.golds >= 3, text: '錬金術師組合、ついに雇用が回復' },
    { when: (s) => s.money.gte('1e1000'), text: 'お札の額面を読み上げるだけで一日が終わる' },
    { when: (s) => s.stats.breads >= 1, text: '「ついにパンが買えた」。国民、涙ながらに食卓を囲む' },
    { when: (s) => s.stats.breads >= 10, text: 'パンの買い占めが社会問題に。犯人は造幣局長か' },
    {
      when: (s) => s.money.gte(1e6),
      text: (s, info) => `今日のインフレ: 資産は約${IG.formatTime(info.doubling)}ごとに2倍になっています`,
    },
    {
      when: (s) => s.money.gte(1e4),
      text: (s, info) => `物価指数 ${IG.format(info.priceIndex)}。パン1斤が ${IG.format(info.breadPrice)} 円に`,
    },
  ];

  IG.data = { GENS, RULES, ZERO_UPGRADES, GOLD_UPGRADES, ACHIEVEMENTS, PRICES, NEWS };
})();
