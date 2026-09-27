const test = require('node:test');
const assert = require('node:assert/strict');
const { D } = require('./load');

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} != ${b}`);

test('数値と文字列から作れる', () => {
  close(D.from(1234.5).toNumber(), 1234.5);
  assert.equal(D.from('1.5e400').e, 400);
  close(D.from('1.5e400').m, 1.5);
  assert.ok(D.from(0).isZero());
  assert.ok(D.from(-5).isZero());
  assert.ok(D.from('garbage').isZero());
  assert.ok(D.from(NaN).isZero());
});

test('四則演算', () => {
  close(D.from(3).add(4).toNumber(), 7);
  close(D.from(10).sub(4).toNumber(), 6);
  assert.ok(D.from(4).sub(10).isZero(), '負になったら 0');
  assert.ok(D.from(5).sub(5).isZero());
  close(D.from(6).mul(7).toNumber(), 42);
  close(D.from(1).div(8).toNumber(), 0.125);
  close(D.from(2).pow(10).toNumber(), 1024, 1e-12);
});

test('Number.MAX_VALUE を超えても計算できる', () => {
  const big = D.from('1e300').mul('1e300');
  assert.equal(big.e, 600);
  close(big.log10(), 600);
  assert.equal(big.toNumber(), Infinity);
  const sum = D.from('5e1000').add('5e1000');
  assert.equal(sum.e, 1001);
  close(sum.m, 1);
  assert.equal(D.from('1e1000').add(1).e, 1000, '桁が離れすぎた足し算は大きいほうが残る');
});

test('比較', () => {
  assert.ok(D.from('1e400').gt('9e399'));
  assert.ok(D.from(0).lt(1));
  assert.ok(D.from(5).eq(5));
  assert.equal(D.from(3).max(7).toNumber(), 7);
  assert.equal(D.from(3).min(7).toNumber(), 3);
});

test('floor と文字列化の往復', () => {
  assert.equal(D.from(9.99).floor().toNumber(), 9);
  assert.equal(D.from(0.5).floor().toNumber(), 0);
  const x = D.from('1.2345e678');
  assert.ok(D.from(JSON.parse(JSON.stringify(x))).eq(x));
});
