/* ipl.js - port of source/descrambler.c, yay0.c and ipl.c: load the user's IPL dump and
 * extract the boot animation's assets by name (works with every IPL version). */
var GCA = GCA || {};
(function (G) {
  const T = (s, v) => (G.t ? G.t(s, v) : v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);
  const rd32 = (d, p) => ((d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]) >>> 0;
  const rd16 = (d, p) => (d[p] << 8) | d[p + 1];
  const magic = (d, p, s) => { for (let i = 0; i < s.length; i++) if (d[p + i] !== s.charCodeAt(i)) return false; return true; };

  /* bootrom descrambler reversed by Segher Boessenkool */
  function descramble(data, start, size) {
    let acc = 0, nacc = 0, t = 0x2953, u = 0xd9c2, v = 0x3ff1, x = 1;
    for (let it = 0; it < size;) {
      const t0 = t & 1, t1 = (t >> 1) & 1, u0 = u & 1, u1 = (u >> 1) & 1, v0 = v & 1;
      x ^= t1 ^ v0;
      x ^= u0 | u1;
      x ^= (t0 ^ u1 ^ v0) & (t0 ^ u0);
      if (t0 === u0) { v >>= 1; if (v0) v ^= 0xb3d0; }
      if (t0 === 0) { u >>= 1; if (u0) u ^= 0xfb10; }
      t >>= 1; if (t0) t ^= 0xa740;
      nacc++;
      acc = ((acc << 1) + x) & 0xFF;
      if (nacc === 8) { data[start + it++] ^= acc; nacc = 0; }
    }
  }

  function yay0Size(d, p) { return magic(d, p, "Yay0") ? rd32(d, p + 4) : 0; }
  function yay0Decompress(d, p) {
    const size = rd32(d, p + 4), dst = new Uint8Array(size);
    let mask = p + 16, link = p + rd32(d, p + 8), chunk = p + rd32(d, p + 12);
    let n = 0, bits = 0, m = 0;
    while (n < size) {
      if (bits === 0) { m = rd32(d, mask); mask += 4; bits = 32; }
      if (m & 0x80000000) dst[n++] = d[chunk++];
      else {
        const v = rd16(d, link), dist = (v & 0xFFF) + 1; let cnt = v >> 12;
        link += 2;
        cnt = cnt ? cnt + 2 : d[chunk++] + 18;
        while (cnt-- && n < size) { dst[n] = dst[n - dist]; n++; }
      }
      m = (m << 1) >>> 0; bits--;
    }
    return dst;
  }

  function countMagic(d, m, max) { let n = 0; for (let i = 0; i + 4 <= d.length && n < max; i += 4) if (magic(d, i, m)) n++; return n; }

  /* ipl_prepare: descramble in place if needed; returns {ok, wasScrambled} */
  function prepare(d) {
    let scrambled = false;
    if (countMagic(d, "Yay0", 4) < 4) { descramble(d, 0x100, d.length - 0x100); scrambled = true; }
    return { ok: countMagic(d, "Yay0", 4) >= 4, scrambled };
  }

  function findTable(d) {
    const size = d.length;
    for (let p = 0; p + 8 < size; p += 4) {
      const n = rd32(d, p);
      if (n < 40 || n > 400 || p + 4 + 4 * n > size) continue;
      const o0 = rd32(d, p + 4);
      if (o0 < 4 + 4 * n || o0 >= 4 + 4 * n + 0x400 || p + o0 + 4 > size) continue;
      if (!magic(d, p + o0, "GLH0") && !magic(d, p + o0, "STH0")) continue;
      let i;
      for (i = 1; i < n; i++) { const o = rd32(d, p + 4 + 4 * i); if (o <= rd32(d, p + 4 * i) || p + o >= size) break; }
      if (i === n) return { pos: p, count: n };
    }
    return null;
  }

  function getRes(d, tab, n, i) {
    const p = tab + rd32(d, tab + 4 + 4 * i);
    if (yay0Size(d, p)) return yay0Decompress(d, p);
    const end = i + 1 < n ? tab + rd32(d, tab + 8 + 4 * i) : d.length;
    let len = end - p;
    if (magic(d, p, "J3D1") && rd32(d, p + 8) <= len) len = rd32(d, p + 8);
    return d.slice(p, p + len);
  }
  function contains(r, s) {
    const b = Array.from(s, c => c.charCodeAt(0));
    outer: for (let i = 0; i + b.length <= r.length; i++) { if (r[i] !== b[0]) continue; for (let k = 1; k < b.length; k++) if (r[i + k] !== b[k]) continue outer; return true; }
    return false;
  }

  /* ipl_extract_assets */
  function extractAssets(d) {
    const T = findTable(d);
    if (!T) return { error: T("The resource directory wasn't found. Is this a GameCube IPL dump?") };
    const a = {}, tileHdr = [0x01, 0x00, 0x00, 0x40, 0x00, 0x40, 0x02, 0x02];
    const take = (k, r) => { if (!a[k]) a[k] = r; };
    for (let i = 0; i < T.count; i++) {
      const p = T.pos + rd32(d, T.pos + 4 + 4 * i);
      const yay = yay0Size(d, p) !== 0;
      if (!yay && !magic(d, p, "J3D1") && !magic(d, p, "IPK1")) continue;
      const r = getRes(d, T.pos, T.count, i);
      if (magic(r, 0, "J3D1bmd1")) {
        if (contains(r, "boot_demo_s_cube\0")) take("s_cube", r);
        else if (contains(r, "boot_demo_base_cube\0")) take("big_cube", r);
        else if (contains(r, "boot_demo_logo_mark")) take("logo", r);
        else if (contains(r, "boot_demo_mat28")) take("letters", r);
      } else if (magic(r, 0, "J3D1bck1")) take("letters_bck", r);
      else if (magic(r, 0, "IPK1")) take("letters_ipk", r);
      else if (r.length === 0x1020 && tileHdr.every((v, k) => r[k] === v)) take("tile_tex", r);
    }
    const need = ["letters", "letters_bck", "letters_ipk", "big_cube", "s_cube", "logo", "tile_tex"];
    const missing = need.filter(k => !a[k]);
    if (missing.length) return { error: T("Some animation assets are missing: {list}.", { list: missing.join(", ") }) };
    return { assets: a, table: T };
  }

  /* version string from the unscrambled header, e.g. "PAL  Revision 1.0" */
  function version(d) {
    let s = ""; for (let i = 0; i < 0x100; i++) s += d[i] >= 32 && d[i] < 127 ? String.fromCharCode(d[i]) : " ";
    const m = /(NTSC|MPAL|PAL)\s+Revision\s+([0-9.]+)/.exec(s);
    return m ? `${m[1]} ${m[2]}` : null;
  }

  /* size of texture i in a J3D model (TEX1 chunk, BTI headers of 0x20 bytes) */
  function j3dTexInfo(r, i) {
    let p = 0x20;
    while (p + 8 <= r.length) {
      const sz = rd32(r, p + 4);
      if (magic(r, p, "TEX1")) { const n = rd16(r, p + 8), h = p + rd32(r, p + 0xC) + 0x20 * i; if (i >= n) return null; return { format: r[h], w: rd16(r, h + 2), h: rd16(r, h + 4), count: n }; }
      if (!sz) break; p += sz;
    }
    return null;
  }

  /* load a dump (ArrayBuffer) -> {ipl, version, scrambled, assets, textTex} or {error} */
  function load(buf) {
    if (buf.byteLength < 0x100000 || buf.byteLength > 0x400000) return { error: T("This file is {kb} KB. IPL dumps are 2 MB.", { kb: (buf.byteLength / 1024).toFixed(0) }) };
    const d = new Uint8Array(buf.slice(0));
    const pr = prepare(d);
    if (!pr.ok) return { error: T("This doesn't look like a GameCube IPL, scrambled or descrambled.") };
    const ex = extractAssets(d);
    if (ex.error) return ex;
    return { ipl: d, version: version(d), scrambled: pr.scrambled, assets: ex.assets, textTex: j3dTexInfo(ex.assets.letters, 0) };
  }

  G.ipl = { load, descramble, yay0Decompress, findTable, extractAssets, version, j3dTexInfo, rd32, rd16 };
})(GCA);
