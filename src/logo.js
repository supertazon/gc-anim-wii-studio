/* logo.js - logotype renderer: font outlines, optical spacing, distance-field bevel, supersampled.
 * Works in brightness only: the Wii keeps luminance x alpha of the image (textimg.c). */
var GCA = GCA || {};
(function (G) {
  const W = 352, H = 40, INF = 1e20;

  const glyphCache = new Map();
  let mcv = null, mctx = null;
  function measure(font, str, size) {
    const key = font + "|" + size.toFixed(3) + "|" + str;
    if (glyphCache.has(key)) return glyphCache.get(key);
    if (!mcv) { mcv = document.createElement("canvas"); mctx = mcv.getContext("2d", { willReadFrequently: true }); }
    mctx.font = `${size}px "${font}"`;
    const adv = mctx.measureText(str).width;
    const pad = Math.ceil(size * 0.6), w = Math.max(1, Math.ceil(adv + pad * 2)), h = Math.ceil(size * 1.8), base = Math.ceil(size * 1.3);
    mcv.width = w; mcv.height = h;
    mctx.font = `${size}px "${font}"`; mctx.fillStyle = "#fff"; mctx.textBaseline = "alphabetic";
    mctx.clearRect(0, 0, w, h); mctx.fillText(str, pad, base);
    const d = mctx.getImageData(0, 0, w, h).data;
    let inkL = Infinity, inkR = -Infinity, inkT = Infinity, inkB = -Infinity;
    const left = new Float32Array(h).fill(NaN), right = new Float32Array(h).fill(NaN);
    for (let y = 0; y < h; y++) {
      let l = -1, r = -1;
      for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 100) { if (l < 0) l = x; r = x; }
      if (l >= 0) { left[y] = l - pad; right[y] = r + 1 - pad; inkL = Math.min(inkL, l - pad); inkR = Math.max(inkR, r + 1 - pad); inkT = Math.min(inkT, y - base); inkB = Math.max(inkB, y - base); }
    }
    const g = { adv, base, left, right, inkL: isFinite(inkL) ? inkL : 0, inkR: isFinite(inkR) ? inkR : adv, inkT: isFinite(inkT) ? inkT : 0, inkB: isFinite(inkB) ? inkB : 0, empty: !isFinite(inkL) };
    if (glyphCache.size > 400) glyphCache.clear();
    glyphCache.set(key, g); return g;
  }
  const capHeightAt = (font, size) => { const g = measure(font, "H", size); return g.empty ? size * 0.7 : -g.inkT; };

  function opticalGap(S, A, B, capH) {
    const depth = capH * 0.35, rows = [];
    for (let y = Math.round(-capH * 1.02); y <= 0; y++) {
      const ya = A.base + y, yb = B.base + y;
      const ra = ya >= 0 && ya < A.right.length ? A.right[ya] : NaN;
      const lb = yb >= 0 && yb < B.left.length ? B.left[yb] : NaN;
      rows.push([isNaN(ra) ? null : A.inkR - ra, isNaN(lb) ? null : lb - B.inkL]);
    }
    const target = S.tight * capH * rows.length;
    const area = d => { let s = 0; for (const [a, b] of rows) { const v = a === null || b === null ? depth : Math.min(depth, a + d + b); s += Math.max(0, v); } return s; };
    let lo = -capH, hi = capH * 1.5;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (area(m) < target) lo = m; else hi = m; }
    let d = (lo + hi) / 2, minRaw = Infinity;
    for (const [a, b] of rows) if (a !== null && b !== null) minRaw = Math.min(minRaw, a + b);
    if (isFinite(minRaw)) d = Math.max(d, capH * 0.03 - minRaw);
    return d;
  }

  function layout(S, font, size) {
    const chars = [...(S.upper ? S.text.toUpperCase() : S.text)];
    const capH = capHeightAt(font, size);
    const items = []; let prev = null, prevCh = null, pendingSpace = 0;
    for (const ch of chars) {
      if (ch === " ") { pendingSpace += S.wordGap * capH; prev = null; continue; }
      const g = measure(font, ch, size);
      if (g.empty) continue;
      let x;
      if (!items.length) x = -g.inkL;
      else {
        const last = items[items.length - 1];
        const kern = prev && S.kerns[prevCh + ch] ? S.kerns[prevCh + ch] * capH : 0;
        if (pendingSpace || !prev) x = last.x + last.g.inkR + (pendingSpace || S.wordGap * capH) - g.inkL;
        else if (S.spacing === "metrics") x = last.x + last.g.adv + S.track * capH + kern;
        else x = last.x + last.g.inkR + opticalGap(S, last.g, g, capH) + S.track * capH + kern - g.inkL;
      }
      items.push({ ch, g, x, size }); prev = g; prevCh = ch; pendingSpace = 0;
    }
    let tm = null;
    if (S.tmOn && items.length) {
      const tsize = size * S.tmScale * 1.45, tg = measure(font, "TM", tsize), last = items[items.length - 1];
      tm = { g: tg, size: tsize, x: last.x + last.g.inkR + S.tmGap * capH - tg.inkL };
    }
    const x0 = items.length ? items[0].x + items[0].g.inkL : 0;
    let x1 = 0; for (const it of items) x1 = Math.max(x1, it.x + it.g.inkR);
    if (tm) x1 = Math.max(x1, tm.x + tm.g.inkR);
    return { items, tm, capH, width: x1 - x0, x0 };
  }

  function edt(grid, w, h) {
    const n = Math.max(w, h), fa = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    function pass(len) {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s; do { const p = v[k]; s = ((fa[q] + q * q) - (fa[p] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) k--; else break; } while (k >= 0);
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0; for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const p = v[k]; d[q] = (q - p) * (q - p) + fa[p]; }
    }
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) fa[y] = grid[y * w + x]; pass(h); for (let y = 0; y < h; y++) grid[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) fa[x] = grid[y * w + x]; pass(w); for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]); }
    return grid;
  }

  const mask = { cv: null, ctx: null };
  /* returns {rgba: Uint8ClampedArray (grey, straight alpha), i8, layout info, clipped, shrunk} */
  function render(S, font) {
    const SS = S.ss, w = W * SS, h = H * SS, N = w * h;
    const targetCap = S.capPct / 100 * H * SS;
    let size = targetCap / (capHeightAt(font, 200) / 200);
    let L = layout(S, font, size);
    const avail = w - 2 * S.margin * SS;
    let shrunk = false;
    for (let i = 0; i < 3 && L.width > avail && L.width > 0; i++) { size *= avail / L.width * 0.999; L = layout(S, font, size); shrunk = true; }
    if (S.align === "stretch" && L.width > 0 && L.width < avail && L.items.length > 1) {
      const extra = (avail - L.width) / (L.items.length - 1 + (L.tm ? 1 : 0));
      L.items.forEach((it, i) => (it.x += extra * i)); if (L.tm) L.tm.x += extra * L.items.length;
      L.width = avail;
    }
    const offX = S.align === "center" ? (w - L.width) / 2 - L.x0 : S.margin * SS - L.x0;
    const capH = L.capH, baseY = h / 2 + capH / 2 + S.vOff * SS;

    if (!mask.cv) { mask.cv = document.createElement("canvas"); mask.ctx = mask.cv.getContext("2d", { willReadFrequently: true }); }
    const mc = mask.ctx; mask.cv.width = w; mask.cv.height = h;
    mc.clearRect(0, 0, w, h); mc.fillStyle = "#fff"; mc.textBaseline = "alphabetic";
    for (const it of L.items) { mc.font = `${it.size}px "${font}"`; mc.fillText(it.ch, offX + it.x, baseY); }
    if (L.tm) { mc.font = `${L.tm.size}px "${font}"`; mc.fillText("TM", offX + L.tm.x, S.tmPos === "bottom" ? baseY - L.tm.g.inkB - 1 : baseY - capH - L.tm.g.inkT); }
    const md = mc.getImageData(0, 0, w, h).data;
    const A = new Float32Array(N); for (let i = 0; i < N; i++) A[i] = md[i * 4 + 3] / 255;
    const gIn = new Float64Array(N), gOut = new Float64Array(N);
    for (let i = 0; i < N; i++) { gIn[i] = A[i] >= 0.5 ? INF : 0; gOut[i] = A[i] >= 0.5 ? 0 : INF; }
    const dIn = edt(gIn, w, h), dOut = edt(gOut, w, h);

    /* premultiplied grey + alpha */
    const V = new Float32Array(N), Al = new Float32Array(N);
    const over = (i, v, a) => { if (a <= 0) return; const k = 1 - a; V[i] = v * a + V[i] * k; Al[i] = a + Al[i] * k; };
    if (S.glowOn) { const rad = S.glowR * SS, lv = S.glowL / 100; for (let i = 0; i < N; i++) { const t = Math.max(0, 1 - dOut[i] / rad); over(i, lv, S.glowA * t * t); } }
    if (S.outOn) { const ow = S.outW * SS, lv = S.outL / 100; for (let i = 0; i < N; i++) over(i, lv, Math.max(A[i], Math.min(1, Math.max(0, ow - dOut[i] + 0.5)))); }
    const lT = S.lTop / 100, lM = S.lMid / 100, lB = S.lBot / 100, top = baseY - capH;
    const bw = Math.max(0.5, S.bevelW * SS), Hh = new Float32Array(N);
    if (S.bevelOn) for (let i = 0; i < N; i++) { const t = Math.min(1, dIn[i] / bw); Hh[i] = t * t * (3 - 2 * t); }
    const th = S.lightA * Math.PI / 180, el = S.lightE * Math.PI / 180;
    const Lx = Math.cos(th) * Math.cos(el), Ly = -Math.sin(th) * Math.cos(el), Lz = Math.sin(el);
    for (let y = 0; y < h; y++) {
      const t = Math.min(1, Math.max(0, (y - top) / capH));
      const base = S.fillMode === "solid" ? lT : S.useMid ? (t < 0.5 ? lT + (lM - lT) * t * 2 : lM + (lB - lM) * (t - 0.5) * 2) : lT + (lB - lT) * t;
      for (let x = 0; x < w; x++) {
        const i = y * w + x; if (A[i] <= 0) continue;
        let v = base;
        if (S.bevelOn) {
          const hx = (Hh[y * w + Math.min(w - 1, x + 1)] - Hh[y * w + Math.max(0, x - 1)]) * 0.5 * bw * 1.6;
          const hy = (Hh[Math.min(h - 1, y + 1) * w + x] - Hh[Math.max(0, y - 1) * w + x]) * 0.5 * bw * 1.6;
          const inv = 1 / Math.sqrt(hx * hx + hy * hy + 1);
          const s = (((-hx) * Lx + (-hy) * Ly + Lz) * inv - Lz) * S.bevelS * 1.6;
          v = s > 0 ? v + (1 - v) * Math.min(1, s) : v * Math.max(0, 1 + s);
        }
        over(i, v, A[i]);
      }
    }
    const rgba = new Uint8ClampedArray(W * H * 4), inv = 1 / (SS * SS);
    let clipped = false;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) { const row = (y * SS + sy) * w + x * SS; for (let sx = 0; sx < SS; sx++) { v += V[row + sx]; a += Al[row + sx]; } }
      v *= inv; a *= inv;
      const o = (y * W + x) * 4, g = a > 1 / 512 ? Math.round(Math.min(1, v / a) * 255) : 0;
      rgba[o] = rgba[o + 1] = rgba[o + 2] = g; rgba[o + 3] = Math.round(a * 255);
      if (rgba[o + 3] > 8 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) clipped = true;
    }
    const i8 = G.textimg.toI8(rgba, W, H, W, H);
    return { rgba, i8, empty: !L.items.length, clipped, shrunk: shrunk && S.align !== "stretch", pairs: pairList(S) };
  }

  function pairList(S) {
    const raw = S.upper ? S.text.toUpperCase() : S.text, seen = new Set(), list = [];
    for (let i = 0; i < raw.length - 1; i++) { const p = raw[i] + raw[i + 1]; if (raw[i] === " " || raw[i + 1] === " " || seen.has(p)) continue; seen.add(p); list.push(p); }
    return list;
  }

  /* how the Wii shows the I8 texture: colour from the texture (default) or from the material ("text" set) */
  function composite(i8, col, out) {
    const bg = col.bg, tx = col.text;
    for (let p = 0, o = 0; p < i8.length; p++, o += 4) {
      const a = i8[p] / 255;
      const c0 = col.textCustom ? tx[0] : i8[p], c1 = col.textCustom ? tx[1] : i8[p], c2 = col.textCustom ? tx[2] : i8[p];
      out[o] = bg[0] * (1 - a) + c0 * a; out[o + 1] = bg[1] * (1 - a) + c1 * a; out[o + 2] = bg[2] * (1 - a) + c2 * a; out[o + 3] = 255;
    }
    return out;
  }

  G.logo = { render, composite, clearCache: () => glyphCache.clear(), W, H };
})(GCA);
