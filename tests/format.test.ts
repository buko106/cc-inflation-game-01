import { assert, test } from 'vitest';
import { fmt, format as F, formatTime } from '../src/core';

test('日本式の表記', () => {
  fmt.notation = 'jp';
  assert.strictEqual(F(0), '0');
  assert.strictEqual(F(5), '5.00');
  assert.strictEqual(F(1234), '1,234');
  assert.strictEqual(F(12345), '1.23万');
  assert.strictEqual(F(1e8), '1.00億');
  assert.strictEqual(F(3.2e12), '3.20兆');
  assert.strictEqual(F(99999999), '1.00億', '繰り上がりで 10000万 にならない');
  assert.strictEqual(F('1e68'), '1.00無量大数');
  assert.strictEqual(F('1e72'), '1.00e72', '無量大数の先は指数表記');
});

test('指数・工学表記', () => {
  assert.strictEqual(F(12345, { notation: 'sci' }), '1.23e4');
  assert.strictEqual(F('1e1234', { notation: 'sci' }), '1.00e1,234');
  assert.strictEqual(F(123456, { notation: 'eng' }), '123e3');
});

test('整数表示', () => {
  assert.strictEqual(F(7.9, { int: true }), '7');
  assert.strictEqual(F(0.2, { int: true }), '0');
});

test('時間', () => {
  assert.strictEqual(formatTime(5), '5.0秒');
  assert.strictEqual(formatTime(125), '2分5秒');
  assert.strictEqual(formatTime(3 * 3600 + 60), '3時間1分');
  assert.strictEqual(formatTime(Infinity), '∞');
});
