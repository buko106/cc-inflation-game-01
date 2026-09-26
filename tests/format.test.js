const test = require('node:test');
const assert = require('node:assert/strict');
const IG = require('./load');

const { format: F, formatTime, fmt } = IG;

test('日本式の表記', () => {
  fmt.notation = 'jp';
  assert.equal(F(0), '0');
  assert.equal(F(5), '5.00');
  assert.equal(F(1234), '1,234');
  assert.equal(F(12345), '1.23万');
  assert.equal(F(1e8), '1.00億');
  assert.equal(F(3.2e12), '3.20兆');
  assert.equal(F(99999999), '1.00億', '繰り上がりで 10000万 にならない');
  assert.equal(F('1e68'), '1.00無量大数');
  assert.equal(F('1e72'), '1.00e72', '無量大数の先は指数表記');
});

test('指数・工学表記', () => {
  assert.equal(F(12345, { notation: 'sci' }), '1.23e4');
  assert.equal(F('1e1234', { notation: 'sci' }), '1.00e1,234');
  assert.equal(F(123456, { notation: 'eng' }), '123e3');
});

test('整数表示', () => {
  assert.equal(F(7.9, { int: true }), '7');
  assert.equal(F(0.2, { int: true }), '0');
});

test('時間', () => {
  assert.equal(formatTime(5), '5.0秒');
  assert.equal(formatTime(125), '2分5秒');
  assert.equal(formatTime(3 * 3600 + 60), '3時間1分');
  assert.equal(formatTime(Infinity), '∞');
});
