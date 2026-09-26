// 起動・ゲームループ・保存
(function () {
  'use strict';
  const IG = globalThis.IG;
  const { game: G } = IG;

  const SAVE_KEY = 'inflation-mint-save-v1';
  const TICK_MS = 50;
  const AUTOSAVE_MS = 10000;
  const OFFLINE_CAP_SEC = 24 * 3600;

  const app = { s: null };

  function loadLocal() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? G.deserialize(raw) : null;
    } catch (e) {
      return null;
    }
  }

  app.save = function () {
    app.s.last = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, G.serialize(app.s));
      return true;
    } catch (e) {
      return false;
    }
  };

  app.replace = function (s) {
    s.last = Date.now();
    app.s = s;
    IG.fmt.notation = s.settings.notation;
    IG.ui.refreshAll();
  };

  app.hardReset = function () {
    app.replace(G.newState());
    app.save();
  };

  function catchUp(sec) {
    const s = app.s;
    const simulated = Math.min(sec, OFFLINE_CAP_SEC);
    const before = { zeros: s.zeros, denoms: s.denoms, golds: s.golds };
    G.advance(s, simulated, 2000);
    G.checkAchievements(s);
    IG.ui.offlineReport(sec, simulated, before);
  }

  function frame(dtSec) {
    const s = app.s;
    // タブが長く止まっていたら、留守中の分としてまとめて進める
    if (dtSec > 60) catchUp(dtSec);
    else G.advance(s, dtSec, 1200);
    for (const a of G.checkAchievements(s)) IG.ui.achievementUnlocked(a);
    if (!s.endingSeen && G.reachedEnd(s)) {
      s.endingSeen = true;
      IG.ui.showEnding();
    }
    IG.ui.render();
  }

  function start(hotData) {
    let s = null;
    if (hotData && hotData.save) {
      try {
        s = G.deserialize(hotData.save);
      } catch (e) {
        s = null;
      }
    }
    if (!s) s = loadLocal();
    const fresh = !s;
    if (!s) s = G.newState();
    app.s = s;
    IG.fmt.notation = s.settings.notation;
    IG.ui.init(app);

    const away = (Date.now() - s.last) / 1000;
    if (!fresh && away > 10) catchUp(away);
    s.last = Date.now();
    G.checkAchievements(s);
    IG.ui.render();

    let prev = performance.now();
    setInterval(() => {
      const now = performance.now();
      const dt = (now - prev) / 1000;
      prev = now;
      frame(dt);
    }, TICK_MS);

    setInterval(app.save, AUTOSAVE_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') app.save();
    });
    window.addEventListener('pagehide', app.save);
  }

  // claude.ai のアーティファクトとして動いているときは、再公開のあいだも状態を引き継ぐ
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try {
      hot.snapshot(() => ({ save: app.s ? G.serialize(app.s) : null }));
    } catch (e) {
      /* 引き継げなくても localStorage から復元できる */
    }
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
