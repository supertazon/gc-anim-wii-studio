/* recolor.js - port of source/recolor.c (single-precision arithmetic, same operation order) */
var GCA = GCA || {};
(function (G) {
  const f = Math.fround;
  const fmodf = (x, y) => f(x % y);

  function rgb2hsv(r, g, b) {
    const mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const d = f(mx - mn);
    const v = mx;
    const s = mx > 0 ? f(d / mx) : 0;
    let h;
    if (d <= 0) h = 0;
    else if (mx === r) h = f(60 * fmodf(f(f(f(g - b) / d) + 6), 6));
    else if (mx === g) h = f(60 * f(f(f(b - r) / d) + 2));
    else h = f(60 * f(f(f(r - g) / d) + 4));
    return [h, s, v];
  }

  function hsv2rgb(h, s, v) {
    h = fmodf(h, 360);
    if (h < 0) h = f(h + 360);
    const c = f(v * s);
    const hh = f(h / 60);
    const x = f(c * f(1 - Math.abs(f(fmodf(hh, 2) - 1))));
    const m = f(v - c);
    let r, g, b;
    switch (Math.trunc(hh)) {
      case 0: r = c; g = x; b = 0; break;
      case 1: r = x; g = c; b = 0; break;
      case 2: r = 0; g = c; b = x; break;
      case 3: r = 0; g = x; b = c; break;
      case 4: r = x; g = 0; b = c; break;
      default: r = c; g = 0; b = x; break;
    }
    return [f(r + m), f(g + m), f(b + m)];
  }

  const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
  const toU8 = x => Math.trunc(f(f(x * 255) + 0.5)) & 255;

  /* recolor_setup_target: target = [r,g,b] or null; cfg = Config */
  function setupTarget(target, cfg) {
    const r = { dh: f(cfg.hue), ks: f(f(cfg.saturation) / 100), kv: f(f(cfg.brightness) / 100) };
    if (target) {
      const [h0, s0, v0] = rgb2hsv(f(95 / 255), f(80 / 255), f(190 / 255));
      const [h1, s1, v1] = rgb2hsv(f(target[0] / 255), f(target[1] / 255), f(target[2] / 255));
      r.dh = f(r.dh + f(h1 - h0));
      r.ks = f(r.ks * f(s1 / s0));
      r.kv = f(r.kv * f(v1 / v0));
    }
    r.active = r.dh !== 0 || r.ks !== 1 || r.kv !== 1;
    return r;
  }

  function recolorHsv(h, s, v) {
    const [R, Gr, B] = hsv2rgb(f(h), f(s), f(v));
    return [toU8(R), toU8(Gr), toU8(B)];
  }

  /* recolor_rgb: returns a new [r,g,b] */
  function recolorRgb(rc, rgb) {
    if (!rc.active) return rgb.slice();
    const [h, s, v] = rgb2hsv(f(rgb[0] / 255), f(rgb[1] / 255), f(rgb[2] / 255));
    const [R, Gr, B] = hsv2rgb(f(h + rc.dh), clamp01(f(s * rc.ks)), clamp01(f(v * rc.kv)));
    return [toU8(R), toU8(Gr), toU8(B)];
  }

  G.recolor = { setupTarget, recolorHsv, recolorRgb, rgb2hsv, hsv2rgb };
})(GCA);
