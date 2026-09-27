// 画面の組み立てと更新。状態は app.s にあり、ここではそれを読んで表示し、操作を game に渡す。
(function () {
  'use strict';
  const IG = globalThis.IG;
  const { D, game: G, data, format: F, formatMult, formatTime } = IG;
  const { GENS, RULES, ZERO_UPGRADES, GOLD_UPGRADES, ACHIEVEMENTS, PRICES, NEWS } = data;

  const $ = (id) => document.getElementById(id);
  const TAB_KEY = 'inflation-mint-tab';
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v === null || v === undefined) continue;
        if (k === 'class') el.className = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const k of kids) if (k !== null && k !== undefined) el.append(k);
    return el;
  }

  // 同じ値なら DOM に触らない
  function setText(el, v) {
    if (el._t !== v) {
      el._t = v;
      el.textContent = v;
    }
  }
  function show(el, on) {
    if (el.hidden === !!on) el.hidden = !on;
  }
  function toggle(el, cls, on) {
    if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
  }
  function setWidth(el, ratio) {
    const v = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
    if (el._w !== v) {
      el._w = v;
      el.style.width = v;
    }
  }
  function setEnabled(el, can) {
    toggle(el, 'can', can);
    const v = can ? 'false' : 'true';
    if (el.getAttribute('aria-disabled') !== v) el.setAttribute('aria-disabled', v);
  }

  const yen = (x) => `${F(x)}円`;
  // ゼロと金塊は個数なので小数を出さない
  const count = (x) => F(x, { int: true });
  const letter = (n) => String.fromCharCode(65 + (((n % 26) + 26) % 26));

  let app = null;
  let tab = 'mint';
  const refs = { gens: [], locked: [], upgs: [], autos: [], achs: [], prices: [] };

  // ---- 組み立て ----

  function buildGens() {
    const wrap = $('gens');
    GENS.forEach((g, i) => {
      const r = {
        mult: h('span', { class: 'gen-mult' }),
        amt: h('b'),
        sub: h('small'),
        prog: h('i'),
        oneCost: h('small'),
        tenLabel: h('span'),
        tenCost: h('small'),
      };
      r.one = h('button', { class: 'btn', type: 'button', 'data-act': 'buyOne', 'data-tier': i }, h('span', null, '1台'), r.oneCost);
      r.ten = h('button', { class: 'btn', type: 'button', 'data-act': 'buyBatch', 'data-tier': i }, r.tenLabel, r.tenCost);
      r.row = h(
        'div',
        { class: 'gen' },
        h('div', { class: 'gen-badge', 'aria-hidden': 'true' }, g.numeral),
        h(
          'div',
          { class: 'gen-info' },
          h('div', { class: 'gen-title' }, h('span', { class: 'gen-name' }, g.name), r.mult),
          h('div', { class: 'gen-flavor' }, g.flavor),
          h('div', { class: 'bar gen-progress', title: '10台そろうごとに倍率アップ' }, r.prog),
        ),
        h('div', { class: 'gen-amount' }, r.amt, r.sub),
        h('div', { class: 'gen-buttons' }, r.one, r.ten),
      );
      const locked = h(
        'div',
        { class: 'gen locked' },
        h('div', { class: 'gen-badge', 'aria-hidden': 'true' }, g.numeral),
        h('div', { class: 'gen-info' }, h('div', { class: 'gen-name' }, g.name), h('div', { class: 'gen-flavor' }, '量的緩和をすると解放されます')),
      );
      wrap.append(r.row, locked);
      refs.gens.push(r);
      refs.locked.push(locked);
    });
  }

  function buildUpgrades(container, defs, unit) {
    for (const u of defs) {
      const r = {
        u,
        unit,
        desc: h('span', { class: 'upg-desc' }),
        level: h('span', { class: 'upg-level' }),
        cost: h('span', { class: 'upg-cost' }),
      };
      r.btn = h(
        'button',
        { class: 'upg', type: 'button', 'data-act': 'upg', 'data-id': u.id },
        h('span', { class: 'upg-name' }, u.name),
        r.desc,
        h('span', { class: 'upg-foot' }, r.level, r.cost),
      );
      container.append(r.btn);
      refs.upgs.push(r);
    }
  }

  function buildAutoToggles() {
    const wrap = $('autoToggles');
    for (const u of ZERO_UPGRADES.filter((x) => x.auto)) {
      const input = h('input', { type: 'checkbox', id: `auto-${u.id}`, 'data-auto': u.id });
      const label = h('label', { class: 'switch', for: `auto-${u.id}` }, input, h('span', null, u.name));
      wrap.append(label);
      refs.autos.push({ id: u.id, label, input });
    }
  }

  function buildAchievements() {
    const grid = $('achGrid');
    for (const a of ACHIEVEMENTS) {
      const el = h(
        'div',
        { class: 'ach' },
        h('span', { class: 'ach-name' }, a.name),
        h('span', { class: 'ach-desc' }, a.desc),
        h('span', { class: 'ach-stamp', 'aria-hidden': 'true' }, '済'),
      );
      grid.append(el);
      refs.achs.push({ a, el });
    }
  }

  function buildPrices() {
    const list = $('priceList');
    for (const p of PRICES) {
      const val = h('b');
      list.append(h('li', null, h('span', null, p.name), val));
      refs.prices.push({ p, val });
    }
  }

  // ---- 地紋 (お札の背景の模様) ----

  function drawGuilloche() {
    const cv = $('guilloche');
    const rect = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const ht = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = w * dpr;
    cv.height = ht * dpr;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, ht);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--guilloche').trim() || '#6f9682';
    ctx.lineWidth = 0.6;

    // 横に流れる波の帯
    ctx.globalAlpha = 0.5;
    for (let k = 0; k < 18; k++) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const t = x / w;
        const y = ht * 0.6 + Math.sin(t * Math.PI * 7 + k * 0.35) * ht * 0.14 * Math.sin(t * Math.PI + 0.4) + Math.cos(t * Math.PI * 3 + k * 0.5) * 5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // 右側のロゼット (内トロコイド)
    const cx = w - Math.min(64, w * 0.12);
    const cy = ht / 2;
    const size = Math.min(ht * 0.48, 110);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    const R = 13;
    const r = 3;
    const d = 6.5;
    const s = size / (R - r + d);
    for (let i = 0; i <= 2400; i++) {
      const t = (i / 2400) * Math.PI * 2 * r;
      const x = cx + s * ((R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t));
      const y = cy + s * ((R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let ring = 0; ring < 2; ring++) {
      const rr0 = size * (1.08 + ring * 0.16);
      ctx.beginPath();
      for (let i = 0; i <= 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        const rr = rr0 * (0.94 + 0.06 * Math.cos(a * (36 + ring * 12)));
        const x = cx + rr * Math.cos(a);
        const y = cy + rr * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // ---- ニュース ----

  let lastNews = null;
  let newsTimer = null;

  function newsInfo(s) {
    const c = G.compute(s);
    return { doubling: G.doublingTime(s, c), priceIndex: G.priceIndex(s), breadPrice: G.price(s, 'bread') };
  }

  function nextNews() {
    const s = app.s;
    const el = $('tickerText');
    show($('ticker'), s.settings.news);
    if (!s.settings.news) return;
    const pool = NEWS.filter((n) => n !== lastNews && n.when(s));
    const n = pool[Math.floor(Math.random() * pool.length)] || NEWS[0];
    lastNews = n;
    const text = typeof n.text === 'function' ? n.text(s, newsInfo(s)) : n.text;
    el.textContent = text;
    if (reducedMotion) return;
    el.style.animation = 'none';
    const width = el.scrollWidth;
    // 1秒あたり約90pxで流す
    el.style.setProperty('--ticker-dur', `${Math.max(8, width / 90)}s`);
    void el.offsetWidth;
    el.style.animation = '';
  }

  function startNews() {
    if (reducedMotion) {
      clearInterval(newsTimer);
      newsTimer = setInterval(nextNews, 9000);
    } else {
      $('tickerText').addEventListener('animationend', nextNews);
    }
    nextNews();
  }

  // ---- 通知・ダイアログ ----

  function toast(mark, text) {
    const wrap = $('toasts');
    const el = h('div', { class: 'toast' }, h('span', { class: 'toast-mark', 'aria-hidden': 'true' }, mark), h('span', null, text));
    wrap.append(el);
    while (wrap.children.length > 4) wrap.firstElementChild.remove();
    setTimeout(() => el.remove(), 4200);
  }

  function openModal(title, nodes) {
    setText($('modalTitle'), title);
    const body = $('modalBody');
    body.replaceChildren(...nodes);
    show($('modal'), true);
    $('modalClose').focus();
  }

  function closeModal() {
    show($('modal'), false);
  }

  function pressStamps(act) {
    if (reducedMotion) return;
    document.querySelectorAll(`[data-act="${act}"]`).forEach((el) => {
      el.classList.remove('pressed');
      void el.offsetWidth;
      el.classList.add('pressed');
    });
  }

  // ---- 操作 ----

  const actions = {
    buyOne: (s, el) => G.buyOne(s, Number(el.dataset.tier)),
    buyBatch: (s, el) => G.buyBatch(s, Number(el.dataset.tier)),
    maxAll: (s) => G.maxAll(s),
    tick: (s) => G.buyTick(s),
    qe: (s) => {
      if (!G.doQE(s)) return;
      const unlocked = G.unlockedTiers(s);
      const msg = s.qe <= GENS.length - RULES.qeBaseTiers ? `${GENS[unlocked - 1].name}が解放されました` : `全造幣機 ×${G.qeBase(s)}`;
      toast('緩', `量的緩和 ${s.qe} 回目。${msg}`);
    },
    denom: (s) => {
      const gain = G.denomGain(s);
      const first = s.denoms === 0 && s.golds === 0;
      if (!G.doDenom(s)) return;
      pressStamps('denom');
      toast('零', `デノミ実行。ゼロを ${count(gain)} 個手に入れました`);
      if (first) toast('零', '「デノミ」タブでゼロを使って強化できます');
    },
    gold: (s) => {
      const gain = G.goldGain(s);
      const first = s.golds === 0;
      if (!G.doGold(s)) return;
      pressStamps('gold');
      toast('金', `金本位制に移行。金塊を ${count(gain)} 個手に入れました`);
      if (first) show($('tabbtn-gold'), true);
    },
    bread: (s) => {
      const p = G.price(s, 'bread');
      if (G.buyBread(s)) toast('麦', `パンを1斤買いました (${yen(p)})`);
    },
    upg: (s, el) => G.buyUpg(s, el.dataset.id),
    save: () => toast('保', app.save() ? '保存しました' : '保存できませんでした。ブラウザの保存領域が使えない可能性があります'),
    export: (s) => {
      const text = G.exportSave(s);
      const area = $('saveText');
      area.value = text;
      area.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => toast('写', 'セーブデータをコピーしました'),
          () => toast('写', '下の欄に書き出しました。全選択してコピーしてください'),
        );
      } else {
        toast('写', '下の欄に書き出しました。全選択してコピーしてください');
      }
    },
    import: () => {
      const text = $('saveText').value;
      if (!text.trim()) {
        toast('読', '下の欄にセーブデータを貼り付けてから押してください');
        return;
      }
      try {
        const s = G.importSave(text);
        app.replace(s);
        app.save();
        toast('読', 'セーブデータを読み込みました');
      } catch (e) {
        toast('読', '読み込めませんでした。文字列が途中で切れていないか確認してください');
      }
    },
    hardReset: (s, el) => {
      if (!el.classList.contains('armed')) {
        el.classList.add('armed');
        el.textContent = '本当にやり直す (もう一度押す)';
        setTimeout(() => {
          el.classList.remove('armed');
          el.textContent = '最初からやり直す';
        }, 4000);
        return;
      }
      el.classList.remove('armed');
      el.textContent = '最初からやり直す';
      app.hardReset();
      selectTab('mint');
      toast('新', '最初からやり直しました');
    },
  };

  function runAction(name, el) {
    const fn = actions[name];
    if (!fn) return;
    fn(app.s, el);
    render();
  }

  function selectTab(name) {
    tab = name;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === name ? 'true' : 'false'));
    document.querySelectorAll('.panel').forEach((p) => show(p, p.id === `tab-${name}`));
    try {
      localStorage.setItem(TAB_KEY, name);
    } catch (e) {
      /* 保存できなくても困らない */
    }
    render();
  }

  function bindEvents() {
    document.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.tab');
      if (tabBtn) {
        selectTab(tabBtn.dataset.tab);
        return;
      }
      const el = e.target.closest('[data-act]');
      if (el) runAction(el.dataset.act, el);
    });

    $('autoToggles').addEventListener('change', (e) => {
      const id = e.target.dataset.auto;
      if (id) app.s.autoOn[id] = e.target.checked;
    });

    $('autoDenomMode').addEventListener('change', (e) => {
      app.s.autoDenom.mode = e.target.value;
      $('autoDenomValue').value = e.target.value === 'time' ? '60' : '1';
      app.s.autoDenom.value = $('autoDenomValue').value;
      render();
    });
    $('autoDenomValue').addEventListener('input', (e) => {
      app.s.autoDenom.value = e.target.value.trim() || '0';
    });

    document.querySelectorAll('input[name="notation"]').forEach((r) =>
      r.addEventListener('change', () => {
        app.s.settings.notation = r.value;
        IG.fmt.notation = r.value;
        render();
      }),
    );
    $('newsToggle').addEventListener('change', (e) => {
      app.s.settings.news = e.target.checked;
      nextNews();
    });

    $('modalClose').addEventListener('click', closeModal);
    $('modal').addEventListener('click', (e) => {
      if (e.target === $('modal')) closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('modal').hidden) {
        closeModal();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      const s = app.s;
      const digit = /^Digit([1-8])$/.exec(e.code);
      if (digit) {
        const i = Number(digit[1]) - 1;
        if (e.shiftKey) G.buyOne(s, i);
        else G.buyBatch(s, i);
      } else {
        const map = { KeyM: 'maxAll', KeyT: 'tick', KeyQ: 'qe', KeyD: 'denom', KeyG: 'gold' };
        const act = map[e.code];
        if (!act) return;
        if (act === 'gold' && s.golds === 0 && !G.canGold(s)) return;
        actions[act](s);
      }
      e.preventDefault();
      render();
    });

    let resizeTimer = null;
    const redraw = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(drawGuilloche, 80);
    };
    if (window.ResizeObserver) new ResizeObserver(redraw).observe(document.querySelector('.note'));
    else window.addEventListener('resize', redraw);
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', redraw);
    }
    new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  // ---- 表示の更新 ----

  function goalOf(s, c) {
    const L = s.money.log10();
    if (s.gens[0].bought === 0) return { text: '輪転機を1台買って、お札を刷り始めよう。', p: s.money.toNumber() / 10 };
    if (s.gens[1].bought === 0 && s.qe === 0 && s.denoms === 0 && s.golds === 0) {
      return { text: '印刷工場 (100円) を買うと、輪転機がひとりでに増えていく。', p: s.money.toNumber() / 100 };
    }
    const qeGoal = () => {
      const t = G.qeTier(s);
      const req = G.qeReq(s);
      if (G.canQE(s)) return { text: '量的緩和ができます。右の「量的緩和を実施」を押すと次の造幣機が解放されます。', p: 1 };
      return { text: `量的緩和まで: ${GENS[t].name}を ${req} 台そろえる (いま ${s.gens[t].bought} 台)`, p: s.gens[t].bought / req };
    };
    if (s.denoms === 0 && s.golds === 0) {
      if (G.canDenom(s)) return { text: 'デノミができます。赤いハンコを押すと、お札のゼロが「ゼロ」になって手に入ります。', p: 1 };
      if (c.n < GENS.length) return qeGoal();
      return { text: `デノミまで: 資産 100穣円 (1e30円)`, p: L / RULES.denomAt };
    }
    if (s.golds === 0) {
      if (G.canGold(s)) return { text: '金本位制に移行できます。金色のハンコを押すと金塊が手に入ります。', p: 1 };
      if (c.n < GENS.length && !G.autoActive(s, 'aQE')) return qeGoal();
      return { text: `金本位制まで: 資産 1.8e308円 (JavaScript の Number.MAX_VALUE)`, p: L / RULES.goldAt };
    }
    if (s.endingSeen) return { text: 'インフレの果てに着きました。ここから先は好きなだけ刷り続けてください。', p: 1 };
    return { text: `インフレの果てまで: 資産 1e${RULES.endExp}円`, p: L / RULES.endExp };
  }

  function renderTop(s, c) {
    setText($('money'), F(s.money));
    setText($('rate'), `+${F(c.moneyRate)}`);
    const dbl = G.doublingTime(s, c);
    show($('doublingWrap'), Number.isFinite(dbl));
    show($('softcapNote'), c.softcapped);
    setText($('doubling'), formatTime(dbl));
    const serial = `${letter(s.golds)}${letter(Math.floor(s.denoms / 26))} ${String(s.denoms % 1e6).padStart(6, '0')} ${letter(s.qe)}`;
    setText($('serial'), serial);
    setText($('serial2'), serial);
    const hasZero = s.denoms > 0 || s.golds > 0;
    show($('zerosTopWrap'), hasZero);
    setText($('zerosTop'), count(s.zeros));
    show($('goldTopWrap'), s.golds > 0);
    setText($('goldTop'), count(s.gold));

    // デノミ / 金本位制のハンコ
    const canD = G.canDenom(s);
    const denomSub = canD ? `+${count(G.denomGain(s))} ゼロ` : `${F(s.money)} / 100穣 円`;
    const canGo = G.canGold(s);
    const goldSub = canGo ? `+${count(G.goldGain(s))} 金塊` : `あと ${F(D.fromLog10(RULES.goldAt).div(s.money.max(1)))} 倍`;
    document.querySelectorAll('[data-act="denom"]').forEach((el) => setEnabled(el, canD));
    document.querySelectorAll('[data-act="gold"]').forEach((el) => setEnabled(el, canGo));
    document.querySelectorAll('[data-bind="denomSub"]').forEach((el) => setText(el, denomSub));
    document.querySelectorAll('[data-bind="goldSub"]').forEach((el) => setText(el, goldSub));

    // タブの印
    const anyZeroUpg = ZERO_UPGRADES.some((u) => G.canBuyUpg(s, u.id));
    const anyGoldUpg = GOLD_UPGRADES.some((u) => G.canBuyUpg(s, u.id));
    show(document.querySelector('#tabbtn-denom .dot'), anyZeroUpg && tab !== 'denom');
    show(document.querySelector('#tabbtn-gold .dot'), anyGoldUpg && tab !== 'gold');
    show($('tabbtn-gold'), s.golds > 0 || s.stats.bestEver.log10() >= 200);
  }

  function renderMint(s, c) {
    const goal = goalOf(s, c);
    setText($('goalText'), goal.text);
    setWidth($('goalBar'), goal.p);

    const tc = G.tickCost(s);
    setEnabled($('tickBtn'), s.money.gte(tc));
    setText($('tickCost'), yen(tc));
    setText($('tickCount'), String(s.tick));
    setText($('tickMult'), formatMult(c.tickMult.div(RULES.speed)));
    setText($('tickBase'), `×${G.tickBase(s).toFixed(3)}`);

    for (let i = 0; i < GENS.length; i++) {
      const r = refs.gens[i];
      const open = i < c.n;
      show(r.row, open);
      show(refs.locked[i], i === c.n);
      if (!open) continue;
      const g = s.gens[i];
      setText(r.mult, formatMult(c.mults[i]));
      setText(r.amt, F(g.amt, { int: true }));
      const what = i === 0 ? '円' : GENS[i - 1].name;
      setText(r.sub, `${g.bought}台購入 · 毎秒 +${F(c.rates[i])} ${what}`);
      setWidth(r.prog, (g.bought % 10) / 10);
      const one = G.unitCost(s, i);
      const n = G.batchSize(s, i);
      const batch = one.mul(n);
      setText(r.oneCost, yen(one));
      setText(r.tenLabel, `${n}台${n === 10 ? '' : ' (10台まで)'}`);
      setText(r.tenCost, yen(batch));
      setEnabled(r.one, s.money.gte(one));
      setEnabled(r.ten, s.money.gte(batch));
    }

    // 量的緩和
    const t = G.qeTier(s);
    const req = G.qeReq(s);
    const qb = G.qeBase(s);
    setText($('qeCount'), `${s.qe} 回 · ${formatMult(D.from(qb).pow(s.qe))}`);
    const next = c.n < GENS.length ? `${GENS[c.n].name}が解放され、` : '';
    setText($('qeDesc'), `${GENS[t].name}を ${req} 台そろえると実施できる。資産と造幣機はリセットされるが、${next}全造幣機が ×${qb} になる。`);
    setText($('qeReq'), `${GENS[t].name} ${s.gens[t].bought} / ${req} 台`);
    setWidth($('qeBar'), s.gens[t].bought / req);
    setEnabled($('qeBtn'), G.canQE(s));

    setText($('denomSideChip'), s.denoms > 0 ? `${s.denoms} 回` : '100穣円から');
    show($('goldSideCard'), s.golds > 0 || s.denoms > 0);

    // 物価
    const idx = G.priceIndex(s);
    setText($('priceIndex'), `指数 ${F(idx)}`);
    for (const r of refs.prices) setText(r.val, yen(G.price(s, r.p.id)));
    const bread = G.price(s, 'bread');
    setText($('realWealth'), F(s.money.div(bread)));
    setText($('breadCost'), yen(bread));
    setEnabled($('breadBtn'), s.money.gte(bread));
  }

  function renderUpgrades(s, layer) {
    for (const r of refs.upgs) {
      if ((r.u.id[0] === 'g') !== (layer === 'gold')) continue;
      const id = r.u.id;
      const l = G.lvl(s, id);
      const maxed = G.upgMaxed(s, id);
      setText(r.desc, r.u.desc(l));
      let level;
      if (r.u.max === Infinity) level = `Lv ${l}`;
      else if (r.u.max === 1) level = l ? '購入済み' : '未購入';
      else level = `Lv ${l} / ${r.u.max}`;
      setText(r.level, level);
      setText(r.cost, maxed ? (r.u.max === 1 ? '' : '最大') : `${count(G.upgCost(s, id))} ${r.unit}`);
      toggle(r.btn, 'maxed', maxed);
      toggle(r.btn, 'can', G.canBuyUpg(s, id));
    }
  }

  function renderDenom(s) {
    setText($('zerosBig'), count(s.zeros));
    setText($('zerosTotal'), count(s.zerosTotal));
    setText($('denomCount'), String(s.denoms));
    setText($('nextZeroAt'), G.canDenom(s) ? F(G.nextDenomAt(s)) : F(D.pow10(RULES.denomAt)));
    setText($('denomScaleText'), String(G.denomScale(s)));
    renderUpgrades(s, 'zero');
    for (const r of refs.autos) {
      const owned = G.lvl(s, r.id) > 0;
      show(r.label, owned);
      if (r.input.checked !== (s.autoOn[r.id] !== false)) r.input.checked = s.autoOn[r.id] !== false;
    }
    const cfg = $('autoDenomConfig');
    show(cfg, G.lvl(s, 'aDenom') > 0);
    const mode = $('autoDenomMode');
    if (mode.value !== s.autoDenom.mode) mode.value = s.autoDenom.mode;
    const val = $('autoDenomValue');
    if (document.activeElement !== val && val.value !== s.autoDenom.value) val.value = s.autoDenom.value;
    setText($('autoDenomHint'), s.autoDenom.mode === 'time' ? '秒以上たったら実行' : 'ゼロ以上もらえるなら実行');
  }

  function renderGold(s) {
    setText($('goldBig'), count(s.gold));
    setText($('goldTotal'), count(s.goldTotal));
    setText($('goldCount'), String(s.golds));
    setText($('goldBonus'), formatMult(s.goldTotal.add(1).pow(2)));
    renderUpgrades(s, 'gold');
  }

  function renderAch(s) {
    let n = 0;
    for (const r of refs.achs) {
      const done = !!s.ach[r.a.id];
      if (done) n++;
      toggle(r.el, 'done', done);
    }
    setText($('achCount'), `${n} / ${ACHIEVEMENTS.length}`);
    setText($('achBonus'), formatMult(G.achMult(s)));
  }

  function renderStats(s, c) {
    const st = s.stats;
    setText($('stPlayed'), formatTime(st.played));
    setText($('stDenomTime'), formatTime(st.denomTime));
    setText($('stBestEver'), yen(st.bestEver));
    setText($('stTotal'), yen(st.totalEver));
    setText($('stBreads'), `${st.breads} 斤`);
    setText($('stQE'), formatMult(D.from(G.qeBase(s)).pow(s.qe)));
    setText($('stTick'), formatMult(c.tickMult.div(RULES.speed)));
    setText($('stGlobal'), formatMult(c.global.div(D.from(G.qeBase(s)).pow(s.qe))));
    setText($('stPer10'), `×${G.per10(s).toFixed(2)}`);
    setText($('stDenoms'), `${s.denoms} 回`);
    setText($('stFastest'), st.fastestDenom === null ? '―' : formatTime(st.fastestDenom));
    const key = st.history.map((x) => `${x.time}:${x.gain}`).join('|') + IG.fmt.notation;
    const list = $('stHistory');
    if (list._k !== key) {
      list._k = key;
      list.replaceChildren(
        ...st.history.map((x) =>
          h('li', null, h('span', null, formatTime(x.time)), h('span', null, `+${count(x.gain)} ゼロ · 毎分 ${F(x.gain.mul(60 / Math.max(x.time, 0.1)))}`)),
        ),
      );
      if (!st.history.length) list.append(h('li', null, h('span', null, 'まだデノミしていません')));
    }
  }

  function renderSettings(s) {
    document.querySelectorAll('input[name="notation"]').forEach((r) => {
      if (r.checked !== (r.value === s.settings.notation)) r.checked = r.value === s.settings.notation;
    });
    if ($('newsToggle').checked !== !!s.settings.news) $('newsToggle').checked = !!s.settings.news;
  }

  function render() {
    if (!app) return;
    const s = app.s;
    const c = G.compute(s);
    renderTop(s, c);
    if (tab === 'mint') renderMint(s, c);
    else if (tab === 'denom') renderDenom(s);
    else if (tab === 'gold') renderGold(s);
    else if (tab === 'ach') renderAch(s);
    else if (tab === 'stats') renderStats(s, c);
    else if (tab === 'settings') renderSettings(s);
  }

  // ---- main.js から呼ばれるもの ----

  function init(theApp) {
    app = theApp;
    buildGens();
    buildUpgrades($('zeroUpgrades'), ZERO_UPGRADES.filter((u) => !u.auto), 'ゼロ');
    buildUpgrades($('autoUpgrades'), ZERO_UPGRADES.filter((u) => u.auto), 'ゼロ');
    buildUpgrades($('goldUpgrades'), GOLD_UPGRADES, '金塊');
    buildAutoToggles();
    buildAchievements();
    buildPrices();
    bindEvents();
    let saved = 'mint';
    try {
      saved = localStorage.getItem(TAB_KEY) || 'mint';
    } catch (e) {
      /* 既定のタブで始める */
    }
    const btn = $(`tabbtn-${saved}`);
    selectTab(btn && !btn.hidden ? saved : 'mint');
    if (saved === 'gold' && app.s.golds > 0) selectTab('gold');
    drawGuilloche();
    startNews();
  }

  function refreshAll() {
    renderSettings(app.s);
    nextNews();
    render();
  }

  function achievementUnlocked(a) {
    toast('済', `実績「${a.name}」を解除`);
  }

  function offlineReport(awaySec, simulatedSec, before) {
    const s = app.s;
    const lines = [h('p', null, `${formatTime(awaySec)} 留守にしている間も、造幣局は動き続けていました。`)];
    if (simulatedSec < awaySec) lines.push(h('p', null, `(計算したのは最大の ${formatTime(simulatedSec)} 分です)`));
    const dl = h('dl', { class: 'kv' });
    const add = (k, v) => dl.append(h('dt', null, k), h('dd', null, v));
    add('いまの資産', yen(s.money));
    if (s.denoms > before.denoms) add('デノミ', `${s.denoms - before.denoms} 回`);
    if (s.zeros.gt(before.zeros)) add('ゼロ', `+${count(s.zeros.sub(before.zeros))}`);
    if (s.golds > before.golds) add('金本位制', `${s.golds - before.golds} 回`);
    lines.push(dl);
    openModal('おかえりなさい', lines);
  }

  function showEnding() {
    const s = app.s;
    openModal('インフレの果て', [
      h('p', null, `資産が 1e${RULES.endExp} 円を超えました。この額面を書き出すと、ゼロだけで ${RULES.endExp.toLocaleString()} 個並びます。`),
      h('p', null, 'パン1斤の値段もとっくに天文学を超えました。それでもあなたは刷り続けました。'),
      h(
        'dl',
        { class: 'kv' },
        h('dt', null, 'プレイ時間'),
        h('dd', null, formatTime(s.stats.played)),
        h('dt', null, 'デノミ'),
        h('dd', null, `${s.denoms} 回`),
        h('dt', null, '金本位制'),
        h('dd', null, `${s.golds} 回`),
        h('dt', null, '買ったパン'),
        h('dd', null, `${s.stats.breads} 斤`),
      ),
      h('p', null, 'ここでおしまいです。遊んでくれてありがとうございました。このまま刷り続けることもできます。'),
    ]);
  }

  IG.ui = { init, render, refreshAll, toast, achievementUnlocked, offlineReport, showEnding };
})();
