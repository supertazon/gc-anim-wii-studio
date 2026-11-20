/* gcmath.js - port of source/gcmath.c (IPL sine table, Euler matrices, hermite) and the
 * libogc helpers it relies on (guLookAt, guMtxConcat, guMtxInvXpose, guOrtho).
 * A matrix is a Float32Array(12), row-major 3x4: m[r*4+c]. */
var GCA = GCA || {};
(function (G) {
  const f = Math.fround;
  const SIN_N = 4096, SIN_SHIFT = 4;
  const tab = new Float32Array(SIN_N + SIN_N / 4);
  (function init() {
    const step = f(f(6.2831855) / SIN_N);
    for (let i = 0; i < tab.length; i++) tab[i] = Math.sin(f(step * i));
  })();
  const sin = a => tab[(a & 0xFFFF) >> SIN_SHIFT];
  const cos = a => tab[((a & 0xFFFF) >> SIN_SHIFT) + SIN_N / 4];

  const mtx = () => new Float32Array(12);
  function ident(m = mtx()) { m.fill(0); m[0] = m[5] = m[10] = 1; return m; }
  function trans(m, x, y, z) { ident(m); m[3] = x; m[7] = y; m[11] = z; return m; }
  function scale(m, x, y, z) { m.fill(0); m[0] = x; m[5] = y; m[10] = z; return m; }
  function euler(m, tx, ty, tz, rx, ry, rz) {
    const sx = sin(rx), cx = cos(rx), sy = sin(ry), cy = cos(ry), sz = sin(rz), cz = cos(rz);
    const czsy = f(cz * sy), szsy = f(sz * sy);
    m[0] = f(cz * cy); m[1] = f(f(-sz * cx) + f(sx * czsy)); m[2] = f(f(sz * sx) + f(cx * czsy)); m[3] = tx;
    m[4] = f(sz * cy); m[5] = f(f(cz * cx) + f(sx * szsy)); m[6] = f(f(-cz * sx) + f(cx * szsy)); m[7] = ty;
    m[8] = -sy; m[9] = f(cy * sx); m[10] = f(cy * cx); m[11] = tz;
    return m;
  }
  function rotaxis(m, axis, a) {
    const s = sin(a), c = cos(a); ident(m);
    if (axis === "x") { m[5] = c; m[6] = -s; m[9] = s; m[10] = c; }
    else if (axis === "y") { m[0] = c; m[2] = s; m[8] = -s; m[10] = c; }
    else { m[0] = c; m[1] = -s; m[4] = s; m[5] = c; }
    return m;
  }
  function scalecols(m, sx, sy, sz) { for (let r = 0; r < 3; r++) { m[r * 4] *= sx; m[r * 4 + 1] *= sy; m[r * 4 + 2] *= sz; } return m; }
  /* ab = a * b (safe when ab aliases a or b) */
  function concat(a, b, ab) {
    const t = new Float32Array(12);
    for (let r = 0; r < 3; r++) {
      const a0 = a[r * 4], a1 = a[r * 4 + 1], a2 = a[r * 4 + 2], a3 = a[r * 4 + 3];
      t[r * 4] = f(f(f(a0 * b[0]) + f(a1 * b[4])) + f(a2 * b[8]));
      t[r * 4 + 1] = f(f(f(a0 * b[1]) + f(a1 * b[5])) + f(a2 * b[9]));
      t[r * 4 + 2] = f(f(f(a0 * b[2]) + f(a1 * b[6])) + f(a2 * b[10]));
      t[r * 4 + 3] = f(f(f(f(a0 * b[3]) + f(a1 * b[7])) + f(a2 * b[11])) + a3);
    }
    ab.set(t); return ab;
  }
  const copy = (src, dst) => (dst.set(src), dst);
  function lookat(m, px, py, pz, ux, uy, uz, tx, ty, tz) {
    const norm = v => { const k = f(1 / Math.sqrt(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2])))); return [f(v[0] * k), f(v[1] * k), f(v[2] * k)]; };
    const cross = (a, b) => [f(f(a[1] * b[2]) - f(a[2] * b[1])), f(f(a[2] * b[0]) - f(a[0] * b[2])), f(f(a[0] * b[1]) - f(a[1] * b[0]))];
    const look = norm([f(px - tx), f(py - ty), f(pz - tz)]);
    const right = norm(cross([ux, uy, uz], look));
    const up = cross(look, right);
    const row = (r, v) => { m[r * 4] = v[0]; m[r * 4 + 1] = v[1]; m[r * 4 + 2] = v[2]; m[r * 4 + 3] = -f(f(f(px * v[0]) + f(py * v[1])) + f(pz * v[2])); };
    row(0, right); row(1, up); row(2, look);
    return m;
  }
  function multvec(m, v) { return [0, 1, 2].map(r => f(f(f(f(m[r * 4] * v[0]) + f(m[r * 4 + 1] * v[1])) + f(m[r * 4 + 2] * v[2])) + m[r * 4 + 3])); }
  /* inverse transpose of the 3x3 part (normal matrix), as Float32Array(9) */
  function invXpose(s) {
    const a = s[0], b = s[1], c = s[2], d = s[4], e = s[5], g = s[6], h = s[8], i = s[9], j = s[10];
    let det = a * e * j + b * g * h + c * d * i - h * e * c - d * b * j - a * i * g;
    const n = new Float32Array(9);
    if (det === 0) return n;
    det = 1 / det;
    n[0] = (e * j - i * g) * det; n[1] = -(d * j - h * g) * det; n[2] = (d * i - h * e) * det;
    n[3] = -(b * j - i * c) * det; n[4] = (a * j - h * c) * det; n[5] = -(a * i - h * b) * det;
    n[6] = (b * g - e * c) * det; n[7] = -(a * g - d * c) * det; n[8] = (a * e - d * b) * det;
    return n;
  }
  function hermite(t, t0, v0, m0, t1, v1, m1) {
    const d = f(t - t0), inv = f(1 / f(t1 - t0)), a = f(inv * f(d * d)), ai = f(a * inv), b = f(d * ai), c = f(3 * ai), bi = f(b * inv);
    const hm0 = f(d + f(b - f(2 * a))), hm1 = f(b - a), hv0 = f(1 + f(f(2 * bi) - c)), hv1 = f(f(-2 * bi) + c);
    const tv0 = f(v0 * hv0), tv1 = f(v1 * hv1), tm0 = f(m0 * hm0), tm1 = f(m1 * hm1);
    return f(tm1 + f(tm0 + f(tv0 + tv1)));
  }
  G.gm = { sin, cos, mtx, ident, trans, scale, euler, rotaxis, scalecols, concat, copy, lookat, multvec, invXpose, hermite };
})(GCA);
