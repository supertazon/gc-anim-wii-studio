/* gx.js - a small software GX for the boot animation: the libogc calls the program makes
 * (same names and enums), display lists, vertex lighting, texgen, TEV, blending, Z, and
 * 3-sample anti-aliasing with the copy filter. Based on tools/swr.py, extended with Z and AA. */
var GCA = GCA || {};
(function (G) {
  const C = {
    PNMTX0: 0, TEXMTX0: 30, IDENTITY: 60, MTX3x4: 0, MTX2x4: 1, NONE: 0, DIRECT: 1, INDEX8: 2, INDEX16: 3,
    VA_PNMTXIDX: 0, VA_POS: 9, VA_NRM: 10, VA_CLR0: 11, VA_CLR1: 12, VA_TEX0: 13, VA_NBT: 25,
    COLOR0: 0, COLOR1: 1, ALPHA0: 2, ALPHA1: 3, COLOR0A0: 4, COLOR1A1: 5, COLORNULL: 0xff,
    TG_MTX3x4: 0, TG_MTX2x4: 1, TG_POS: 0, TG_NRM: 1, TG_TEX0: 4,
    CULL_NONE: 0, CULL_FRONT: 1, CULL_BACK: 2, CULL_ALL: 3,
    QUADS: 0x80, TRIANGLES: 0x90, TRIANGLESTRIP: 0x98, TRIANGLEFAN: 0xA0,
    TEVPREV: 0, CC_ZERO: 15, CC_ONE: 12, CC_TEXC: 8, CC_RASC: 10, CC_CPREV: 0, CA_ZERO: 7, CA_KONST: 6, CA_APREV: 0, CA_TEXA: 4, CA_RASA: 5,
    MODULATE: 0, DECAL: 1, BLEND: 2, REPLACE: 3, PASSCLR: 4, TEV_ADD: 0, TB_ZERO: 0, CS_SCALE_1: 0,
    BM_NONE: 0, BM_BLEND: 1, BM_LOGIC: 2, BM_SUBTRACT: 3,
    TEV_KCSEL_1_4: 6, TEV_KASEL_1: 0, TEV_KASEL_K0_A: 0x1C,
    ALWAYS: 7, LEQUAL: 3, LIGHT0: 1, DF_NONE: 0, DF_SIGNED: 1, DF_CLAMP: 2, AF_SPEC: 0, AF_SPOT: 1, AF_NONE: 2, SRC_REG: 0, SRC_VTX: 1
  };
  const warned = new Set();
  const warn = m => { if (!warned.has(m)) { warned.add(m); if (typeof console !== "undefined") console.warn("gx: " + m); } };

  /* ---------------- textures ---------------- */
  const texCache = new WeakMap();
  function decodeTex(t) {
    if (t.rgbaF) return t.rgbaF;   /* already decoded (procedural / render-target textures) */
    let byBuf = texCache.get(t.buf); if (!byBuf) { byBuf = new Map(); texCache.set(t.buf, byBuf); }
    const key = `${t.off}|${t.w}|${t.h}|${t.fmt}`;
    if (byBuf.has(key)) return byBuf.get(key);
    const { w, h, fmt } = t, d = t.buf, out = new Float32Array(w * h * 4);
    let o = t.off;
    const put = (x, y, r, g, b, a) => { if (x < w && y < h) { const p = (y * w + x) * 4; out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = a; } };
    const bw = fmt === 0 ? 8 : fmt === 1 || fmt === 2 ? 8 : 4, bh = fmt === 0 ? 8 : 4;
    const bx = Math.ceil(w / bw), by = Math.ceil(h / bh);
    for (let j = 0; j < by; j++) for (let i = 0; i < bx; i++) {
      if (fmt === 6) {
        for (let k = 0; k < 16; k++) put(i * 4 + (k & 3), j * 4 + (k >> 2), d[o + 2 * k + 1], d[o + 32 + 2 * k], d[o + 32 + 2 * k + 1], d[o + 2 * k]);
        o += 64; continue;
      }
      for (let k = 0; k < (fmt === 0 ? 64 : fmt <= 2 ? 32 : 16); k++) {
        const x = i * bw + (k % bw), y = j * bh + Math.floor(k / bw);
        if (fmt === 0) { const b = d[o + (k >> 1)], v = (k & 1 ? b & 15 : b >> 4) * 17; put(x, y, v, v, v, v); }
        else if (fmt === 1) { const v = d[o + k]; put(x, y, v, v, v, v); }
        else if (fmt === 2) { const b = d[o + k], v = (b & 15) * 17; put(x, y, v, v, v, (b >> 4) * 17); }
        else if (fmt === 3) { const a = d[o + 2 * k], v = d[o + 2 * k + 1]; put(x, y, v, v, v, a); }
        else if (fmt === 4) { const v = (d[o + 2 * k] << 8) | d[o + 2 * k + 1]; put(x, y, (v >> 11) * 255 / 31, (v >> 5 & 63) * 255 / 63, (v & 31) * 255 / 31, 255); }
        else if (fmt === 5) {
          const v = (d[o + 2 * k] << 8) | d[o + 2 * k + 1];
          if (v & 0x8000) put(x, y, (v >> 10 & 31) * 255 / 31, (v >> 5 & 31) * 255 / 31, (v & 31) * 255 / 31, 255);
          else put(x, y, (v >> 8 & 15) * 17, (v >> 4 & 15) * 17, (v & 15) * 17, (v >> 12 & 7) * 255 / 7);
        } else { warn("texture format " + fmt); put(x, y, 255, 0, 255, 255); }
      }
      o += 32;
    }
    byBuf.set(key, out);
    return out;
  }
  function wrapc(c, n, mode) {
    if (mode === 0) return c < 0 ? 0 : c > n - 1 ? n - 1 : c;
    if (mode === 1) return ((c % n) + n) % n;
    const m = ((c % (2 * n)) + 2 * n) % (2 * n); return m >= n ? 2 * n - 1 - m : m;
  }
  function sample(t, s, tt, out) {
    const tex = decodeTex(t), w = t.w, h = t.h;
    if (t.linear) {
      const x = s * w - 0.5, y = tt * h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const xa = wrapc(x0, w, t.wrapS), xb = wrapc(x0 + 1, w, t.wrapS), ya = wrapc(y0, h, t.wrapT), yb = wrapc(y0 + 1, h, t.wrapT);
      const p00 = (ya * w + xa) * 4, p01 = (ya * w + xb) * 4, p10 = (yb * w + xa) * 4, p11 = (yb * w + xb) * 4;
      for (let c = 0; c < 4; c++) out[c] = tex[p00 + c] * (1 - fx) * (1 - fy) + tex[p01 + c] * fx * (1 - fy) + tex[p10 + c] * (1 - fx) * fy + tex[p11 + c] * fx * fy;
    } else {
      const x = wrapc(Math.floor(s * w), w, t.wrapS), y = wrapc(Math.floor(tt * h), h, t.wrapT), p = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[c] = tex[p + c];
    }
  }

  /* ---------------- the GX object ---------------- */
  const AA = [[3, 2], [9, 6], [3, 10], [3, 2], [9, 6], [3, 10], [9, 2], [3, 6], [9, 10], [9, 2], [3, 6], [9, 10]];
  const VF_INTERLACED = [8, 8, 10, 12, 10, 8, 8];
  const kTable = [255, 223, 191, 159, 128, 96, 64, 32];

  function create(W, H) {
    const g = { W, H, C };
    const N = W * H;
    g.col = [0, 1, 2].map(() => new Float32Array(N * 3));   /* one colour buffer per AA sample */
    g.z = [0, 1, 2].map(() => new Float32Array(N));
    g.pos = Array.from({ length: 10 }, () => G.gm.ident());
    g.nrm = Array.from({ length: 10 }, () => new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]));
    g.tex = Array.from({ length: 10 }, () => ({ m: G.gm.ident(), type: 1 }));
    g.cur = 0;
    g.proj = { p: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], ortho: true };
    g.vp = { x: 0, y: 0, w: W, h: H, n: 0, f: 1 };
    g.cull = C.CULL_BACK;
    g.numChans = 0;
    g.chan = [0, 1, 2, 3].map(() => ({ enable: 0, amb: 0, mat: 1, lit: 0, diff: 0, attn: 2 }));
    g.matc = [[255, 255, 255, 255], [255, 255, 255, 255]];
    g.ambc = [[0, 0, 0, 0], [0, 0, 0, 0]];
    g.light = Array.from({ length: 8 }, () => ({ pos: [0, 0, 0], col: [255, 255, 255, 255] }));
    g.numTexGens = 1;
    g.texgen = Array.from({ length: 8 }, (_, i) => ({ type: 1, src: 4 + i, mtx: 60 }));
    g.numTev = 1;
    g.tev = Array.from({ length: 16 }, (_, i) => ({ c: [15, 15, 15, 15, 0, 0, 0, 1, 0], a: [7, 7, 7, 7, 0, 0, 0, 1, 0], tc: i < 8 ? i : 0xff, map: i < 8 ? i : 0xff, ras: i < 8 ? 4 : 0xff, kc: 6, ka: 0 }));
    g.tevReg = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    g.kreg = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    g.maps = new Array(8).fill(null);
    g.blend = { type: 0, src: 4, dst: 5, op: 0 };
    g.colorUpdate = 1; g.zmode = { en: 1, func: 3, upd: 1 };
    g.vdesc = new Array(26).fill(0);
    g.vfmt = Array.from({ length: 8 }, () => ({}));
    g.arrays = {};
    g.clearColor = [0, 0, 0];

    /* ---- state calls (libogc semantics) ---- */
    g.SetCullMode = m => (g.cull = m);
    g.SetNumChans = n => (g.numChans = n);
    const chanIdx = ch => ch & 3;
    g.SetChanCtrl = (ch, enable, amb, mat, lit, diff, attn) => {
      const v = { enable, amb, mat, lit, diff: attn === C.AF_SPEC ? C.DF_NONE : diff, attn };
      if (enable && attn !== C.AF_NONE) warn("light attenuation mode " + attn + " treated as none");
      g.chan[chanIdx(ch)] = v;
      if (ch === C.COLOR0A0) g.chan[2] = { ...v }; else if (ch === C.COLOR1A1) g.chan[3] = { ...v };
    };
    const setRGBA = (arr, ch, c) => {
      const i = ch === C.COLOR0 || ch === C.ALPHA0 || ch === C.COLOR0A0 ? 0 : 1;
      if (ch === C.COLOR0 || ch === C.COLOR1) { arr[i][0] = c[0]; arr[i][1] = c[1]; arr[i][2] = c[2]; }
      else if (ch === C.ALPHA0 || ch === C.ALPHA1) arr[i][3] = c[3];
      else arr[i] = c.slice(0, 4);
    };
    g.SetChanMatColor = (ch, c) => setRGBA(g.matc, ch, c);
    g.SetChanAmbColor = (ch, c) => setRGBA(g.ambc, ch, c);
    g.SetNumTexGens = n => (g.numTexGens = n);
    g.SetTexCoordGen2 = (tc, type, src, mtx) => { g.texgen[tc] = { type, src, mtx }; };
    g.LoadTexMtxImm = (m, id, type) => { if (id >= 30 && id < 60) g.tex[(id - 30) / 3 | 0] = { m: new Float32Array(m), type }; };
    g.LoadPosMtxImm = (m, id) => { g.pos[id / 3 | 0] = new Float32Array(m); };
    g.LoadNrmMtxImm = (m, id) => { g.nrm[id / 3 | 0] = m.length === 9 ? new Float32Array(m) : new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); };
    g.SetCurrentMtx = id => (g.cur = id / 3 | 0);
    g.LoadProjectionMtx = (p, ortho) => { g.proj = { p: Array.from(p), ortho }; };
    g.SetViewport = (x, y, w, h, n, f) => { g.vp = { x, y, w, h, n, f }; };
    g.SetNumTevStages = n => (g.numTev = n);
    g.SetTevColorS10 = (reg, c) => { g.tevReg[reg] = c.slice(0, 4); };
    g.SetTevColor = g.SetTevColorS10;
    g.SetTevKColor = (k, c) => { g.kreg[k] = c.slice(0, 4); };
    g.SetTevKColorSel = (s, v) => (g.tev[s].kc = v);
    g.SetTevKAlphaSel = (s, v) => (g.tev[s].ka = v);
    g.SetTevColorIn = (s, a, b, c, d) => { const t = g.tev[s].c; t[0] = a; t[1] = b; t[2] = c; t[3] = d; };
    g.SetTevAlphaIn = (s, a, b, c, d) => { const t = g.tev[s].a; t[0] = a; t[1] = b; t[2] = c; t[3] = d; };
    g.SetTevColorOp = (s, op, bias, scale, clamp, dest) => { const t = g.tev[s].c; t[4] = op; t[5] = bias; t[6] = scale; t[7] = clamp; t[8] = dest; };
    g.SetTevAlphaOp = (s, op, bias, scale, clamp, dest) => { const t = g.tev[s].a; t[4] = op; t[5] = bias; t[6] = scale; t[7] = clamp; t[8] = dest; };
    g.SetTevOp = (s, mode) => {
      const dc = s === 0 ? C.CC_RASC : C.CC_CPREV, da = s === 0 ? C.CA_RASA : C.CA_APREV;
      if (mode === C.MODULATE) { g.SetTevColorIn(s, 15, 8, dc, 15); g.SetTevAlphaIn(s, 7, 4, da, 7); }
      else if (mode === C.DECAL) { g.SetTevColorIn(s, dc, 8, 9, 15); g.SetTevAlphaIn(s, 7, 7, 7, da); }
      else if (mode === C.BLEND) { g.SetTevColorIn(s, dc, 12, 8, 15); g.SetTevAlphaIn(s, 7, 4, da, 5); }
      else if (mode === C.REPLACE) { g.SetTevColorIn(s, 15, 15, 15, 8); g.SetTevAlphaIn(s, 7, 7, 7, 4); }
      else if (mode === C.PASSCLR) { g.SetTevColorIn(s, 15, 15, 15, dc); g.SetTevAlphaIn(s, 7, 7, 7, da); }
      g.SetTevColorOp(s, 0, 0, 0, 1, 0); g.SetTevAlphaOp(s, 0, 0, 0, 1, 0);
    };
    g.SetTevOrder = (s, tc, map, ras) => { g.tev[s].tc = tc; g.tev[s].map = map; g.tev[s].ras = ras; };
    g.LoadTexObj = (obj, map) => (g.maps[map] = obj);
    g.SetBlendMode = (type, src, dst, op) => (g.blend = { type, src, dst, op });
    g.SetZMode = (en, func, upd) => (g.zmode = { en, func, upd });
    g.SetColorUpdate = v => (g.colorUpdate = v);
    g.LoadLightObj = (lo, id) => { const i = Math.log2(id) | 0; g.light[i] = { pos: lo.pos.slice(), col: lo.col.slice() }; };
    g.ClearVtxDesc = () => g.vdesc.fill(0);
    g.SetVtxDesc = (attr, type) => (g.vdesc[attr] = type);
    g.SetVtxAttrFmt = (fmt, attr, cnt, type, frac) => (g.vfmt[fmt][attr] = { cnt, type, frac });
    g.SetArray = (attr, buf, off, stride) => (g.arrays[attr] = { buf, off, stride });
    for (const k of ["SetZCompLoc", "SetCoPlanar", "SetAlphaUpdate", "SetDither", "InvVtxCache", "InvalidateTexAll", "SetAlphaCompare", "SetScissor", "SetScissorBoxOffset"]) g[k] = () => {};

    g.clear = rgb => {
      g.clearColor = rgb.slice();
      for (let s = 0; s < 3; s++) { const c = g.col[s]; for (let i = 0; i < N; i++) { c[i * 3] = rgb[0]; c[i * 3 + 1] = rgb[1]; c[i * 3 + 2] = rgb[2]; } g.z[s].fill(1); }
    };

    /* ---- vertex input ---- */
    const compSize = t => (t <= 1 ? 1 : t <= 3 ? 2 : 4);
    function readComp(dv, o, type, frac) {
      switch (type) {
        case 0: return dv.getUint8(o) / (1 << frac);
        case 1: return dv.getInt8(o) / (1 << frac);
        case 2: return dv.getUint16(o) / (1 << frac);
        case 3: return dv.getInt16(o) / (1 << frac);
        default: return dv.getFloat32(o);
      }
    }
    function attrSize(attr, f) {
      if (attr === C.VA_POS) return (f.cnt ? 3 : 2) * compSize(f.type);
      if (attr === C.VA_NRM) return (f.cnt ? 9 : 3) * compSize(f.type);
      if (attr === C.VA_CLR0 || attr === C.VA_CLR1) return [2, 3, 4, 2, 3, 4][f.type] || 4;
      if (attr >= 13 && attr <= 20) return (f.cnt ? 2 : 1) * compSize(f.type);
      return 1;
    }
    function decodeAttr(attr, f, dv, o) {
      if (attr === C.VA_POS) { const n = f.cnt ? 3 : 2, s = compSize(f.type), r = []; for (let i = 0; i < n; i++) r.push(readComp(dv, o + i * s, f.type, f.frac)); if (n === 2) r.push(0); return r; }
      if (attr === C.VA_NRM) { const s = compSize(f.type), fr = f.type === 1 ? 6 : f.type === 3 ? 14 : 0; return [0, 1, 2].map(i => readComp(dv, o + i * s, f.type, fr)); }
      if (attr === C.VA_CLR0 || attr === C.VA_CLR1) {
        const b = i => dv.getUint8(o + i);
        switch (f.type) {
          case 0: { const v = dv.getUint16(o); return [(v >> 11) * 255 / 31, (v >> 5 & 63) * 255 / 63, (v & 31) * 255 / 31, 255]; }
          case 1: return [b(0), b(1), b(2), 255];
          case 2: return [b(0), b(1), b(2), 255];
          case 3: { const v = dv.getUint16(o); return [(v >> 12) * 17, (v >> 8 & 15) * 17, (v >> 4 & 15) * 17, (v & 15) * 17]; }
          case 4: { const v = (b(0) << 16) | (b(1) << 8) | b(2); return [(v >> 18) * 255 / 63, (v >> 12 & 63) * 255 / 63, (v >> 6 & 63) * 255 / 63, (v & 63) * 255 / 63]; }
          default: return [b(0), b(1), b(2), b(3)];
        }
      }
      if (attr >= 13 && attr <= 20) { const s = compSize(f.type); return f.cnt ? [readComp(dv, o, f.type, f.frac), readComp(dv, o + s, f.type, f.frac)] : [readComp(dv, o, f.type, f.frac), 0]; }
      return dv.getUint8(o);
    }
    const ATTRS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const dvCache = new WeakMap();
    const dvOf = buf => { let d = dvCache.get(buf); if (!d) { d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); dvCache.set(buf, d); } return d; };

    g.CallDispList = (buf, off, size) => {
      const dv = dvOf(buf); let p = off; const end = off + size;
      while (p < end) {
        const op = dv.getUint8(p);
        if (op === 0) { p++; continue; }
        if (op >= 0x80 && op < 0xC0) {
          const prim = op & 0xF8, fmt = op & 7, n = dv.getUint16(p + 1); p += 3;
          const verts = [];
          for (let v = 0; v < n; v++) {
            const vx = {};
            for (const attr of ATTRS) {
              const t = g.vdesc[attr]; if (!t) continue;
              if (attr <= 8) { vx[attr === 0 ? "pnmtx" : "tm" + (attr - 1)] = dv.getUint8(p); p++; continue; }
              const f = g.vfmt[fmt][attr] || { cnt: 1, type: 4, frac: 0 };
              if (t === C.DIRECT) { vx[attr] = decodeAttr(attr, f, dv, p); p += attrSize(attr, f); }
              else {
                const idx = t === C.INDEX8 ? dv.getUint8(p) : dv.getUint16(p); p += t === C.INDEX8 ? 1 : 2;
                const a = g.arrays[attr]; if (!a) { warn("no array for attr " + attr); continue; }
                vx[attr] = decodeAttr(attr, f, dvOf(a.buf), a.off + idx * a.stride);
              }
            }
            verts.push(vx);
          }
          draw(prim, verts);
          continue;
        }
        warn("display list opcode 0x" + op.toString(16)); break;
      }
    };
    /* immediate mode */
    let imm = null;
    g.Begin = (prim, fmt, n) => { imm = { prim, fmt, verts: [], cur: null }; };
    const immVert = () => { if (!imm.cur) { imm.cur = {}; imm.verts.push(imm.cur); } return imm.cur; };
    g.Position3s16 = (x, y, z) => { imm.cur = null; const v = immVert(), f = g.vfmt[imm.fmt][C.VA_POS] || { frac: 0 }, k = 1 << f.frac; v[C.VA_POS] = [x / k, y / k, z / k]; };
    g.Position3f32 = (x, y, z) => { imm.cur = null; immVert()[C.VA_POS] = [x, y, z]; };
    g.TexCoord2s16 = (s, t) => { const f = g.vfmt[imm.fmt][C.VA_TEX0] || { frac: 0 }, k = 1 << f.frac; imm.cur[C.VA_TEX0] = [s / k, t / k]; };
    g.Color4u8 = (r, gg, b, a) => { imm.cur[C.VA_CLR0] = [r, gg, b, a]; };
    g.TexCoord2f32 = (s, t) => { imm.cur[C.VA_TEX0] = [s, t]; };
    g.End = () => { const v = imm.verts; const p = imm.prim; imm = null; draw(p, v); };

    /* ---- transform, lighting, texgen ---- */
    function draw(prim, verts) {
      const n = verts.length; if (!n) return;
      const P = g.proj.p, vp = g.vp;
      const xv = verts.map(v => {
        const pm = v.pnmtx !== undefined ? v.pnmtx / 3 | 0 : g.cur;
        const M = g.pos[pm], Nm = g.nrm[pm], p = v[C.VA_POS] || [0, 0, 0];
        const ex = M[0] * p[0] + M[1] * p[1] + M[2] * p[2] + M[3], ey = M[4] * p[0] + M[5] * p[1] + M[6] * p[2] + M[7], ez = M[8] * p[0] + M[9] * p[1] + M[10] * p[2] + M[11];
        const nr = v[C.VA_NRM];
        const nv = nr ? [Nm[0] * nr[0] + Nm[1] * nr[1] + Nm[2] * nr[2], Nm[3] * nr[0] + Nm[4] * nr[1] + Nm[5] * nr[2], Nm[6] * nr[0] + Nm[7] * nr[1] + Nm[8] * nr[2]] : [0, 0, 0];
        let cx, cy, cz, w;
        if (g.proj.ortho) { cx = P[0] * ex + P[3]; cy = P[5] * ey + P[7]; cz = P[10] * ez + P[11]; w = 1; }
        else { cx = P[0] * ex + P[2] * ez; cy = P[5] * ey + P[6] * ez; cz = P[10] * ez + P[11]; w = -ez; }
        const sx = vp.x + vp.w / 2 + (cx / w) * vp.w / 2, sy = vp.y + vp.h / 2 - (cy / w) * vp.h / 2;
        const depth = 1 + cz / w;
        return { sx, sy, depth, ras: lighting(v, [ex, ey, ez], nv), tc: texgens(v, p, nr || [0, 0, 0]) };
      });
      const tris = [];
      if (prim === C.TRIANGLES) for (let i = 0; i + 2 < n; i += 3) tris.push([i, i + 1, i + 2]);
      else if (prim === C.TRIANGLESTRIP) for (let i = 0; i + 2 < n; i++) tris.push(i % 2 === 0 ? [i, i + 1, i + 2] : [i + 1, i, i + 2]);
      else if (prim === C.TRIANGLEFAN) for (let i = 1; i + 1 < n; i++) tris.push([0, i, i + 1]);
      else if (prim === C.QUADS || prim === 0x88) for (let i = 0; i + 3 < n; i += 4) { tris.push([i, i + 1, i + 2]); tris.push([i, i + 2, i + 3]); }
      else { warn("primitive 0x" + prim.toString(16)); return; }
      for (const t of tris) raster(xv[t[0]], xv[t[1]], xv[t[2]]);
    }
    function lighting(v, pos, nv) {
      const out = [[0, 0, 0, 0], [0, 0, 0, 0]];
      for (let ch = 0; ch < 2; ch++) {
        if (ch >= g.numChans) continue;
        const vc = v[ch ? C.VA_CLR1 : C.VA_CLR0] || [255, 255, 255, 255];
        for (const [ctl, c0, c1] of [[g.chan[ch], 0, 3], [g.chan[ch + 2], 3, 4]]) {
          for (let k = c0; k < c1; k++) {
            const mat = ctl.mat ? vc[k] : g.matc[ch][k];
            if (!ctl.enable) { out[ch][k] = mat; continue; }
            let lit = ctl.amb ? vc[k] : g.ambc[ch][k];
            for (let l = 0; l < 8; l++) {
              if (!(ctl.lit >> l & 1)) continue;
              const L = g.light[l];
              let lx = L.pos[0] - pos[0], ly = L.pos[1] - pos[1], lz = L.pos[2] - pos[2];
              const ln = Math.hypot(lx, ly, lz) + 1e-12; lx /= ln; ly /= ln; lz /= ln;
              let nd = lx * nv[0] + ly * nv[1] + lz * nv[2];
              if (ctl.diff === C.DF_CLAMP) nd = Math.max(nd, 0); else if (ctl.diff === C.DF_NONE) nd = 1;
              lit += nd * L.col[k];
            }
            lit = lit < 0 ? 0 : lit > 255 ? 255 : lit;
            out[ch][k] = mat * lit / 255;
          }
        }
      }
      return out;
    }
    function texgens(v, p, nr) {
      const out = [];
      for (let t = 0; t < g.numTexGens; t++) {
        const tg = g.texgen[t];
        let iv;
        if (tg.src === C.TG_POS) iv = [p[0], p[1], p[2], 1];
        else if (tg.src === C.TG_NRM) iv = [nr[0], nr[1], nr[2], 1];
        else if (tg.src >= 4 && tg.src <= 11) { const tc = v[13 + tg.src - 4] || [0, 0]; iv = [tc[0], tc[1], 1, 1]; }
        else { warn("texgen source " + tg.src); iv = [0, 0, 1, 1]; }
        let m;
        if (tg.mtx === C.IDENTITY) m = G.gm.ident();
        else if (tg.mtx >= 30) m = g.tex[(tg.mtx - 30) / 3 | 0].m;
        else m = g.pos[tg.mtx / 3 | 0];
        const s = m[0] * iv[0] + m[1] * iv[1] + m[2] * iv[2] + m[3] * iv[3];
        const tt = m[4] * iv[0] + m[5] * iv[1] + m[6] * iv[2] + m[7] * iv[3];
        const q = tg.type === C.TG_MTX3x4 ? m[8] * iv[0] + m[9] * iv[1] + m[10] * iv[2] + m[11] * iv[3] : 1;
        if (tg.type > 1) warn("texgen type " + tg.type);
        out.push([s, tt, q]);
      }
      return out;
    }

    /* ---- rasterisation, TEV, blending ---- */
    const ras0 = new Float64Array(4), ras1 = new Float64Array(4), texv = new Float64Array(4);
    const regs = [new Float64Array(4), new Float64Array(4), new Float64Array(4), new Float64Array(4)];
    const tcs = Array.from({ length: 8 }, () => new Float64Array(3));
    const ZT = [(a, b) => false, (a, b) => a < b, (a, b) => a === b, (a, b) => a <= b, (a, b) => a > b, (a, b) => a >= b, (a, b) => a !== b, () => true];

    function raster(A, B, Cv) {
      const area = (B.sx - A.sx) * (Cv.sy - A.sy) - (Cv.sx - A.sx) * (B.sy - A.sy);
      if (Math.abs(area) < 1e-9) return;
      if (g.cull === C.CULL_ALL) return;
      if (g.cull === C.CULL_BACK && area < 0) return;
      if (g.cull === C.CULL_FRONT && area > 0) return;
      const x0 = Math.max(0, Math.floor(Math.min(A.sx, B.sx, Cv.sx))), x1 = Math.min(W - 1, Math.ceil(Math.max(A.sx, B.sx, Cv.sx)));
      const y0 = Math.max(0, Math.floor(Math.min(A.sy, B.sy, Cv.sy))), y1 = Math.min(H - 1, Math.ceil(Math.max(A.sy, B.sy, Cv.sy)));
      if (x0 > x1 || y0 > y1) return;
      const inv = 1 / area;
      const bary = (X, Y) => {
        const w0 = ((B.sx - X) * (Cv.sy - Y) - (Cv.sx - X) * (B.sy - Y)) * inv;
        const w1 = ((Cv.sx - X) * (A.sy - Y) - (A.sx - X) * (Cv.sy - Y)) * inv;
        return [w0, w1, 1 - w0 - w1];
      };
      const ntc = A.tc.length, zt = ZT[g.zmode.func], zen = g.zmode.en, zup = g.zmode.upd;
      const bl = g.blend;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const qi = ((y & 1) << 1 | (x & 1)) * 3;
        let mask = 0; const zs = [0, 0, 0];
        for (let s = 0; s < 3; s++) {
          const sp = AA[qi + s], [w0, w1, w2] = bary(x + sp[0] / 12, y + sp[1] / 12);
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const zz = w0 * A.depth + w1 * B.depth + w2 * Cv.depth;
          if (zz < 0 || zz > 1) continue;
          zs[s] = zz;
          if (zen && !zt(zz, g.z[s][y * W + x])) continue;
          mask |= 1 << s;
        }
        if (!mask) continue;
        const [w0, w1, w2] = bary(x + 0.5, y + 0.5);
        for (let k = 0; k < 4; k++) {
          ras0[k] = w0 * A.ras[0][k] + w1 * B.ras[0][k] + w2 * Cv.ras[0][k];
          ras1[k] = w0 * A.ras[1][k] + w1 * B.ras[1][k] + w2 * Cv.ras[1][k];
        }
        for (let t = 0; t < ntc; t++) for (let k = 0; k < 3; k++) tcs[t][k] = w0 * A.tc[t][k] + w1 * B.tc[t][k] + w2 * Cv.tc[t][k];
        const out = tevPixel(ntc);
        const sa = out[3] / 255;
        for (let s = 0; s < 3; s++) {
          if (!(mask >> s & 1)) continue;
          const pi = y * W + x, cb = g.col[s];
          if (zen && zup) g.z[s][pi] = zs[s];
          if (!g.colorUpdate) continue;
          for (let k = 0; k < 3; k++) {
            const dst = cb[pi * 3 + k], src = out[k];
            let v;
            if (bl.type === C.BM_BLEND) {
              const fac = (f, srcSide) => f === 0 ? 0 : f === 1 ? 1 : f === 2 ? (srcSide ? dst : src) / 255 : f === 3 ? 1 - (srcSide ? dst : src) / 255 : f === 4 ? sa : f === 5 ? 1 - sa : f === 6 ? 1 : 0;
              v = src * fac(bl.src, true) + dst * fac(bl.dst, false);
            } else if (bl.type === C.BM_SUBTRACT) v = dst - src;
            else v = src;
            cb[pi * 3 + k] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
        }
      }
    }
    const res = new Float64Array(4);
    function kval(sel, comp) {
      if (sel <= 7) return kTable[sel];
      if (sel >= 12 && sel <= 15) return g.kreg[sel - 12][comp];
      if (sel >= 16) return g.kreg[(sel - 16) % 4][((sel - 16) / 4) | 0];
      return 0;
    }
    function combine(A, Bv, Cc, D, op) {
      const c = Cc < 0 ? 0 : Cc > 255 ? 255 : Cc, cc = c + (c >= 128 ? 1 : 0);
      const a = A < 0 ? 0 : A > 255 ? 255 : A, b = Bv < 0 ? 0 : Bv > 255 ? 255 : Bv;
      const lerp = (a * (256 - cc) + b * cc) / 256;
      let v = op[4] & 1 ? D - lerp : D + lerp;
      v += [0, 128, -128, 0][op[5]];
      v *= [1, 2, 4, 0.5][op[6]];
      return op[7] ? (v < 0 ? 0 : v > 255 ? 255 : v) : v < -1024 ? -1024 : v > 1023 ? 1023 : v;
    }
    function tevPixel(ntc) {
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) regs[r][k] = g.tevReg[r][k];
      for (let s = 0; s < g.numTev; s++) {
        const st = g.tev[s];
        if (st.map !== 0xff && st.tc !== 0xff && st.tc < ntc && g.maps[st.map]) {
          const q = Math.abs(tcs[st.tc][2]) < 1e-9 ? 1 : tcs[st.tc][2];
          sample(g.maps[st.map], tcs[st.tc][0] / q, tcs[st.tc][1] / q, texv);
        } else { texv[0] = texv[1] = texv[2] = texv[3] = 255; }
        const R = st.ras === 0 || st.ras === 2 || st.ras === 4 ? ras0 : st.ras === 1 || st.ras === 3 || st.ras === 5 ? ras1 : null;
        const rv = k => (R ? R[k] : 0);
        const cin = (sel, k) => {
          switch (sel) {
            case 0: return regs[0][k]; case 1: return regs[0][3]; case 2: return regs[1][k]; case 3: return regs[1][3];
            case 4: return regs[2][k]; case 5: return regs[2][3]; case 6: return regs[3][k]; case 7: return regs[3][3];
            case 8: return texv[k]; case 9: return texv[3]; case 10: return rv(k); case 11: return rv(3);
            case 12: return 255; case 13: return 128; case 14: return kval(st.kc, k); default: return 0;
          }
        };
        const ain = sel => {
          switch (sel) {
            case 0: return regs[0][3]; case 1: return regs[1][3]; case 2: return regs[2][3]; case 3: return regs[3][3];
            case 4: return texv[3]; case 5: return rv(3); case 6: return kval(st.ka, 3); default: return 0;
          }
        };
        const c = st.c, a = st.a;
        for (let k = 0; k < 3; k++) res[k] = combine(cin(c[0], k), cin(c[1], k), cin(c[2], k), cin(c[3], k), c);
        res[3] = combine(ain(a[0]), ain(a[1]), ain(a[2]), ain(a[3]), a);
        const dc = regs[c[8]], da = regs[a[8]];
        dc[0] = res[0]; dc[1] = res[1]; dc[2] = res[2]; da[3] = res[3];
      }
      const o = regs[0];
      return [o[0] < 0 ? 0 : o[0] > 255 ? 255 : o[0], o[1] < 0 ? 0 : o[1] > 255 ? 255 : o[1], o[2] < 0 ? 0 : o[2] > 255 ? 255 : o[2], o[3] < 0 ? 0 : o[3] > 255 ? 255 : o[3]];
    }

    /* ---- copy to the frame buffer: AA resolve with the IPL's interlaced copy filter ---- */
    g.copyOut = (rgba) => {
      const vf = VF_INTERLACED, c = g.col;
      for (let y = 0; y < H; y++) {
        const yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
        for (let x = 0; x < W; x++) {
          const p = y * W + x, pu = yu * W + x, pd = yd * W + x;
          for (let k = 0; k < 3; k++) {
            const v = (vf[0] * c[1][pu * 3 + k] + vf[1] * c[2][pu * 3 + k] + vf[2] * c[0][p * 3 + k] + vf[3] * c[1][p * 3 + k] + vf[4] * c[2][p * 3 + k] + vf[5] * c[0][pd * 3 + k] + vf[6] * c[1][pd * 3 + k]) / 64;
            rgba[p * 4 + k] = v;
          }
          rgba[p * 4 + 3] = 255;
        }
      }
      return rgba;
    };
    /* texture copy of the EFB with a given vertical filter (RGBA8: rounded, 0..255); RGB floats */
    g.resolveF = (vf) => {
      const c = g.col, out = new Float32Array(N * 3);
      for (let y = 0; y < H; y++) {
        const yu = Math.max(0, y - 1), yd = Math.min(H - 1, y + 1);
        for (let x = 0; x < W; x++) {
          const p = y * W + x, pu = yu * W + x, pd = yd * W + x;
          for (let k = 0; k < 3; k++) {
            const v = (vf[0] * c[1][pu * 3 + k] + vf[1] * c[2][pu * 3 + k] + vf[2] * c[0][p * 3 + k] + vf[3] * c[1][p * 3 + k] + vf[4] * c[2][p * 3 + k] + vf[5] * c[0][pd * 3 + k] + vf[6] * c[1][pd * 3 + k]) / 64;
            out[p * 3 + k] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
          }
        }
      }
      return out;
    };
    return g;
  }

  G.gx = { create, C, sample, decodeTex, warned };
})(GCA);
