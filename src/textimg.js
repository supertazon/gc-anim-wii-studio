/* textimg.js - port of source/textimg.c: any image -> the I8 texture the Wii uses for "GAMECUBE" */
var GCA = GCA || {};
(function (G) {
  const f = Math.fround;
  /* rgba: Uint8(Clamped)Array iw*ih*4 (straight alpha, as stb_image returns) -> Uint8Array w*h (linear, not tiled) */
  function toI8(rgba, iw, ih, w, h) {
    const lum = new Float32Array(iw * ih);
    let x0 = iw, y0 = ih, x1 = -1, y1 = -1;
    for (let y = 0; y < ih; y++)
      for (let x = 0; x < iw; x++) {
        const o = 4 * (y * iw + x);
        const l = f(f(f(f(f(0.299) * rgba[o]) + f(f(0.587) * rgba[o + 1])) + f(f(0.114) * rgba[o + 2])) * rgba[o + 3]);
        const v = f(l / 255);
        lum[y * iw + x] = v;
        if (v > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    if (x1 < 0 || (iw === w && ih === h)) { x0 = 0; y0 = 0; x1 = iw - 1; y1 = ih - 1; }
    const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
    const out = new Uint8Array(w * h);
    const a = f(cw / w), b = f(chh / h), scale = a > b ? a : b;
    const ox = f(f(w - f(cw / scale)) * 0.5), oy = f(f(h - f(chh / scale)) * 0.5);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const sx0 = f(f(x - ox) * scale), sy0 = f(f(y - oy) * scale);
        const sx1 = f(sx0 + scale), sy1 = f(sy0 + scale);
        let acc = 0, n = 0;
        for (let iy = Math.floor(sy0); iy < Math.ceil(sy1); iy++)
          for (let ix = Math.floor(sx0); ix < Math.ceil(sx1); ix++) {
            if (ix < 0 || iy < 0 || ix >= cw || iy >= chh) continue;
            acc = f(acc + lum[(iy + y0) * iw + ix + x0]);
            n = f(n + 1);
          }
        out[y * w + x] = n > 0 ? Math.trunc(f(f(acc / n) + 0.5)) & 255 : 0;
      }
    return out;
  }
  G.textimg = { toI8, W: 352, H: 40 };
})(GCA);
