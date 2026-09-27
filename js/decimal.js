// 巨大数ライブラリ。Number.MAX_VALUE (約1.8e308) を超える値を扱うため、
// 値を 仮数 m (1 <= m < 10) と 指数 e (整数) の組で持つ。負の値は扱わない。
(function () {
  'use strict';
  const IG = (globalThis.IG = globalThis.IG || {});

  class D {
    constructor(m, e) {
      this.m = m;
      this.e = e;
    }

    // 任意の入力 (D / number / "1.2e345" / [m, e]) を D に変換する
    static from(x) {
      if (x instanceof D) return x;
      if (typeof x === 'number') return fromNumber(x);
      if (typeof x === 'string') return fromString(x);
      if (Array.isArray(x)) return make(Number(x[0]), Number(x[1]));
      return D.ZERO;
    }

    static pow10(n) {
      return Number.isInteger(n) ? new D(1, n) : D.fromLog10(n);
    }

    static fromLog10(l) {
      if (l === -Infinity || Number.isNaN(l)) return D.ZERO;
      const e = Math.floor(l);
      return make(Math.pow(10, l - e), e);
    }

    isZero() {
      return this.m === 0;
    }

    add(x) {
      const b = D.from(x);
      if (b.m === 0) return this;
      if (this.m === 0) return b;
      let hi = this;
      let lo = b;
      if (hi.e < lo.e) [hi, lo] = [lo, hi];
      const d = hi.e - lo.e;
      if (d > 17) return hi;
      return make(hi.m + lo.m / Math.pow(10, d), hi.e);
    }

    // 結果が負になる場合は 0 に丸める
    sub(x) {
      const b = D.from(x);
      if (b.m === 0) return this;
      const d = this.e - b.e;
      if (d < 0) return D.ZERO;
      if (d > 17) return this;
      const m = this.m - b.m / Math.pow(10, d);
      return m <= this.m * 1e-15 ? D.ZERO : make(m, this.e);
    }

    mul(x) {
      const b = D.from(x);
      if (this.m === 0 || b.m === 0) return D.ZERO;
      return make(this.m * b.m, this.e + b.e);
    }

    div(x) {
      const b = D.from(x);
      if (b.m === 0) return D.ZERO;
      if (this.m === 0) return D.ZERO;
      return make(this.m / b.m, this.e - b.e);
    }

    pow(p) {
      if (p === 0) return D.ONE;
      if (this.m === 0) return D.ZERO;
      return D.fromLog10(this.log10() * p);
    }

    log10() {
      return this.m === 0 ? -Infinity : this.e + Math.log10(this.m);
    }

    cmp(x) {
      const b = D.from(x);
      if (this.m === 0) return b.m === 0 ? 0 : -1;
      if (b.m === 0) return 1;
      if (this.e !== b.e) return this.e > b.e ? 1 : -1;
      if (this.m === b.m) return 0;
      return this.m > b.m ? 1 : -1;
    }

    gte(x) { return this.cmp(x) >= 0; }
    gt(x) { return this.cmp(x) > 0; }
    lte(x) { return this.cmp(x) <= 0; }
    lt(x) { return this.cmp(x) < 0; }
    eq(x) { return this.cmp(x) === 0; }

    max(x) {
      const b = D.from(x);
      return this.gte(b) ? this : b;
    }

    min(x) {
      const b = D.from(x);
      return this.lte(b) ? this : b;
    }

    floor() {
      if (this.e >= 16) return this;
      if (this.e < 0) return D.ZERO;
      return fromNumber(Math.floor(this.toNumber() + 1e-9));
    }

    toNumber() {
      if (this.m === 0) return 0;
      if (this.e > 308) return Infinity;
      if (this.e < -324) return 0;
      return this.m * Math.pow(10, this.e);
    }

    toString() {
      return this.m === 0 ? '0' : `${this.m}e${this.e}`;
    }

    toJSON() {
      return this.toString();
    }
  }

  function make(m, e) {
    if (!(m > 0) || !Number.isFinite(e)) return D.ZERO;
    if (!Number.isFinite(m)) return D.ZERO;
    if (m >= 10 || m < 1) {
      const k = Math.floor(Math.log10(m));
      m = k > 300 || k < -300 ? m / Math.pow(10, k / 2) / Math.pow(10, k - k / 2) : m / Math.pow(10, k);
      e += k;
      // 浮動小数点の誤差で範囲外に出た分を補正
      if (m >= 10) { m /= 10; e += 1; }
      if (m < 1) { m *= 10; e -= 1; }
    }
    return new D(m, e);
  }

  function fromNumber(n) {
    if (!(n > 0) || !Number.isFinite(n)) return D.ZERO;
    return make(n, 0);
  }

  function fromString(s) {
    const str = s.trim();
    const i = str.toLowerCase().indexOf('e');
    if (i < 0) return fromNumber(Number(str));
    const m = Number(str.slice(0, i));
    const e = Number(str.slice(i + 1));
    if (!Number.isFinite(m) || !Number.isFinite(e)) return D.ZERO;
    if (!Number.isInteger(e)) return D.fromLog10(Math.log10(m) + e);
    return make(m, e);
  }

  D.ZERO = new D(0, 0);
  D.ONE = new D(1, 0);

  IG.D = D;
})();
