// ゲームのコア。DOM・localStorage・タイマーには触らないので、Node からそのまま動かせる (テストもここが対象)。
// UI からは `import * as G from '../core'` のようにまとめて使う
export { D, type DLike } from './decimal';
export * from './format';
export * from './data';
export * from './state';
export * from './production';
export * from './purchase';
export * from './prestige';
export * from './upgrades';
export * from './automation';
export * from './simulation';
export * from './market';
export * from './achievements';
export * from './save';
