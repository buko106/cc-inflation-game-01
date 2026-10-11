// 起動・ゲームループ・保存
import './ui/style.css';
import * as G from './core';
import * as ui from './ui/ui';
import type { App } from './ui/ui';

const SAVE_KEY = 'inflation-mint-save-v1';
const TICK_MS = 50;
const AUTOSAVE_MS = 10000;
const OFFLINE_CAP_SEC = 24 * 3600;

// claude.ai のアーティファクトとして動いているときにだけある、再公開をまたいで状態を引き継ぐ仕組み
interface HotData {
  save?: string | null;
}
interface Hot {
  data?: HotData;
  snapshot?: (fn: () => HotData) => void;
  ready?: (fn: (data: HotData) => void) => void;
}
declare global {
  interface Window {
    claude?: { hot?: Hot };
  }
}

function loadLocal(): G.State | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? G.deserialize(raw) : null;
  } catch {
    return null;
  }
}

// start で状態を入れてから使う
const app: App = {
  s: null as unknown as G.State,
  save() {
    app.s.last = Date.now();
    try {
      localStorage.setItem(SAVE_KEY, G.serialize(app.s));
      return true;
    } catch {
      return false;
    }
  },
  replace(s) {
    s.last = Date.now();
    app.s = s;
    G.fmt.notation = s.settings.notation;
    ui.refreshAll();
  },
  hardReset() {
    app.replace(G.newState());
    app.save();
  },
};

function catchUp(sec: number): void {
  const s = app.s;
  const simulated = Math.min(sec, OFFLINE_CAP_SEC);
  const before = { zeros: s.zeros, denoms: s.denoms, golds: s.golds };
  G.advance(s, simulated, 2000);
  G.checkAchievements(s);
  ui.offlineReport(sec, simulated, before);
}

function frame(dtSec: number): void {
  const s = app.s;
  // タブが長く止まっていたら、留守中の分としてまとめて進める
  if (dtSec > 60) catchUp(dtSec);
  else G.advance(s, dtSec, 1200);
  for (const a of G.checkAchievements(s)) ui.achievementUnlocked(a);
  if (!s.endingSeen && G.reachedEnd(s)) {
    s.endingSeen = true;
    ui.showEnding();
  }
  ui.render();
}

function start(hotData: HotData): void {
  let s: G.State | null = null;
  if (hotData && hotData.save) {
    try {
      s = G.deserialize(hotData.save);
    } catch {
      s = null;
    }
  }
  if (!s) s = loadLocal();
  const fresh = !s;
  if (!s) s = G.newState();
  app.s = s;
  G.fmt.notation = s.settings.notation;
  ui.init(app);

  const away = (Date.now() - s.last) / 1000;
  if (!fresh && away > 10) catchUp(away);
  s.last = Date.now();
  G.checkAchievements(s);
  ui.render();

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

const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') {
  try {
    hot.snapshot(() => ({ save: app.s ? G.serialize(app.s) : null }));
  } catch {
    /* 引き継げなくても localStorage から復元できる */
  }
}
if (hot && typeof hot.ready === 'function') hot.ready(start);
else start((hot && hot.data) || {});
