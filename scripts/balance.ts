// バランス調整用 bot。戦略ごとに各到達点までのゲーム内時間を表にする
//   npm run balance                         すべての戦略
//   npm run balance -- optimal casual       戦略を選ぶ
//   npm run balance -- --max 3h --dt 0.1    上限時間と1ステップの秒数
import { formatTime } from '../src/core';
import { MILESTONES, runStrategy } from '../src/bot/run';
import { findStrategy, STRATEGIES } from '../src/bot/strategy';

function parseDuration(text: string): number {
  const m = /^(\d+(?:\.\d+)?)(s|m|h)?$/.exec(text);
  if (!m) throw new Error(`時間の書き方が違います: ${text} (例: 90m, 2h, 600)`);
  return Number(m[1]) * ({ s: 1, m: 60, h: 3600 } as const)[(m[2] as 's' | 'm' | 'h') || 's'];
}

const args = process.argv.slice(2);
let maxSec = 2 * 3600;
let dt = 0.05;
const names: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--max') maxSec = parseDuration(args[++i]);
  else if (args[i] === '--dt') dt = Number(args[++i]);
  else if (args[i] === '--list') {
    for (const st of STRATEGIES) console.log(`${st.name.padEnd(14)} ${st.description}`);
    process.exit(0);
  } else names.push(args[i]);
}

const strategies = names.length ? names.map((n) => findStrategy(n) ?? fail(`戦略がありません: ${n} (--list で一覧)`)) : STRATEGIES;

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const rows: string[][] = [['戦略', ...MILESTONES.map((m) => m.label), 'デノミ', '金本位', '最高額', '計算']];
for (const st of strategies) {
  const t0 = Date.now();
  const r = runStrategy(st, { maxSec, dt });
  rows.push([
    st.name,
    ...MILESTONES.map((m) => (r.times[m.id] === null ? '―' : formatTime(r.times[m.id]!))),
    `${r.denoms}回`,
    `${r.golds}回`,
    `1e${Math.floor(r.bestLog10)}`,
    `${((Date.now() - t0) / 1000).toFixed(1)}s`,
  ]);
}

console.log(`上限 ${formatTime(maxSec)} / 1ステップ ${dt}秒 (― は上限までに届かなかった到達点)\n`);
console.log(`| ${rows[0].join(' | ')} |`);
console.log(`|${rows[0].map(() => ' --- ').join('|')}|`);
for (const row of rows.slice(1)) console.log(`| ${row.join(' | ')} |`);
