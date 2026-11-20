/* anim.js - port of source/anim.c: J3D1bck1 joint animation and IPK1 material colour animation */
var GCA = GCA || {};
(function (G) {
  const f = Math.fround, M = G.gm;
  const dv = d => new DataView(d.buffer, d.byteOffset, d.byteLength);
  const s16 = x => (x << 16) >> 16;

  function sampleKeys(t, count, tanmode, K) {
    const st = tanmode ? 4 : 3, last = st * (count - 1);
    let p = 0, n = count;
    if (!(t >= K(0))) return K(1);
    if (t >= K(last)) return K(last + 1);
    while (n > 1) { const h = n >> 1; if (K(p + h * st) <= t) { p += h * st; n -= h; } else n = h; }
    return M.hermite(t, K(p), K(p + 1), K(p + st - 1), K(p + st), K(p + st + 1), K(p + st + 2));
  }

  function bckInit(file) {
    const d = dv(file), s = 0x20;
    const magic = String.fromCharCode(...file.slice(0, 8)), sec = String.fromCharCode(...file.slice(s, s + 4));
    if (file.length < 0x60 || magic !== "J3D1bck1" || sec !== "ANK1") return null;
    return { d, shift: file[s + 9], njoints: d.getUint16(s + 0xC), jtab: s + d.getUint32(s + 0x14),
      scale: s + d.getUint32(s + 0x18), rot: s + d.getUint32(s + 0x1C), trans: s + d.getUint32(s + 0x20) };
  }
  function bckSrt(a, j, t) {
    const d = a.d, jt = a.jtab + 0x36 * j, S = [0, 0, 0], R = [0, 0, 0], T = [0, 0, 0];
    const kf = base => i => d.getFloat32(base + 4 * i), ks = base => i => d.getInt16(base + 2 * i);
    for (let ax = 0; ax < 3; ax++) {
      const sc = jt + 0x12 * ax, ro = sc + 6, tr = sc + 12;
      let cnt = d.getUint16(sc), idx = d.getUint16(sc + 2), tm = d.getUint16(sc + 4);
      S[ax] = cnt === 1 ? d.getFloat32(a.scale + 4 * idx) : cnt === 0 ? 1 : sampleKeys(t, cnt, tm, kf(a.scale + 4 * idx));
      cnt = d.getUint16(ro); idx = d.getUint16(ro + 2); tm = d.getUint16(ro + 4);
      R[ax] = cnt === 1 ? s16(d.getInt16(a.rot + 2 * idx) << a.shift) : cnt === 0 ? 0 : s16(Math.trunc(sampleKeys(t, cnt, tm, ks(a.rot + 2 * idx))) << a.shift);
      cnt = d.getUint16(tr); idx = d.getUint16(tr + 2); tm = d.getUint16(tr + 4);
      T[ax] = cnt === 1 ? d.getFloat32(a.trans + 4 * idx) : cnt === 0 ? 0 : sampleKeys(t, cnt, tm, kf(a.trans + 4 * idx));
    }
    return { S, R, T };
  }
  function bckLocal(a, j, t, out) {
    const { S, R, T } = bckSrt(a, j, t);
    M.euler(out, T[0], T[1], T[2], R[0], R[1], R[2]);
    if (S[0] !== 1 || S[1] !== 1 || S[2] !== 1) M.scalecols(out, S[0], S[1], S[2]);
    return out;
  }

  function ipkInit(file) {
    if (file.length < 0x24 || String.fromCharCode(...file.slice(0, 4)) !== "IPK1") return null;
    const d = dv(file), otab = d.getUint32(0xC), oent = d.getUint32(0x10);
    return { d, map: otab, nmap: (oent - otab) >> 1, ent: oent, tab: [0, 1, 2, 3].map(c => d.getUint32(0x14 + 4 * c)) };
  }
  function ipkColor(a, mat, frame) {
    if (mat >= a.nmap) return [255, 255, 255, 255];
    const d = a.d, t = f(frame / 30), e = a.ent + 0x18 * d.getInt16(a.map + 2 * mat), out = [0, 0, 0, 0];
    for (let c = 0; c < 4; c++) {
      const cnt = d.getUint16(e + 6 * c), idx = d.getUint16(e + 6 * c + 2), tm = d.getUint16(e + 6 * c + 4);
      const base = a.tab[c] + 4 * idx;
      const v = cnt === 1 ? d.getFloat32(base) : cnt === 0 ? 0 : sampleKeys(t, cnt, tm, i => d.getFloat32(base + 4 * i));
      out[c] = !(v >= 0) ? 0 : v <= 255 ? Math.trunc(v) & 255 : 255;
    }
    return out;
  }
  G.anim = { bckInit, bckSrt, bckLocal, ipkInit, ipkColor };
})(GCA);
