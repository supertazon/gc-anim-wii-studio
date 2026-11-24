/* config.js - port of source/config.c (gc-anim.ini parsing, same rules as the Wii)
 * plus the studio's editable model and its serialisation back to an ini file. */
var GCA = GCA || {};
(function (G) {
  const MAX_TILES = 16;
  const T = (s, v) => (G.t ? G.t(s, v) : v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k]) : m)) : s);

  function configDefaults() {
    return {
      intro: 0, allow_skip: 0, camera: 1, force_43: 0, volume: 199, start_delay: 0,
      color_random: 0, have_color: 0, color: [0, 0, 0], hue: 0, saturation: 100, brightness: 100,
      have_cube: 0, cube_follow: 0, cube: [0, 0, 0],
      ntiles: 0, tiles_rainbow: 0, tiles_spread: 0, tiles: [], trail: 0,
      have_logo: 0, logo: [0, 0, 0], have_drop: 0, drop: [0, 0, 0], drop_blend: 0,
      have_glass: 0, glass: [0, 0, 0], glass_opacity: 100,
      have_background: 0, background: [0, 0, 0], have_promo_background: 0, promo_background: [0, 0, 0], have_text: 0, text: [0, 0, 0],
      letters: "", letters_fill: 0, text_image: "", smb_full: 0
    };
  }

  const isSpace = ch => ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\v" || ch === "\f";
  const isDigit = ch => ch >= "0" && ch <= "9";
  const trim = s => { let a = 0, b = s.length; while (a < b && isSpace(s[a])) a++; while (b > a && isSpace(s[b - 1])) b--; return s.slice(a, b); };
  const eqi = (a, b) => a.toLowerCase() === b.toLowerCase();

  /* C atoi: optional whitespace, sign, digits (int overflow ignored: values are clamped by callers) */
  function atoi(s) {
    let i = 0; while (i < s.length && isSpace(s[i])) i++;
    let neg = false; if (s[i] === "+" || s[i] === "-") { neg = s[i] === "-"; i++; }
    let n = 0; while (i < s.length && isDigit(s[i])) { n = n * 10 + (s.charCodeAt(i) - 48); if (n > 2147483647) n = 2147483647; i++; }
    return neg ? -n : n;
  }
  /* C strtoul(s+pos, &end, 16) on a 32-bit target: returns [value, endIndex] */
  function strtoul16(s, pos) {
    let i = pos; while (i < s.length && isSpace(s[i])) i++;
    let neg = false; if (s[i] === "+" || s[i] === "-") { neg = s[i] === "-"; i++; }
    if (s[i] === "0" && (s[i + 1] === "x" || s[i + 1] === "X") && /[0-9a-fA-F]/.test(s[i + 2] || "")) i += 2;
    const st = i; let v = 0, over = false;
    while (i < s.length && /[0-9a-fA-F]/.test(s[i])) { v = v * 16 + parseInt(s[i], 16); if (v > 0xFFFFFFFF) over = true; i++; }
    if (i === st) return [0, pos];
    if (over) v = 0xFFFFFFFF; else if (neg) v = (0x100000000 - v) >>> 0;
    return [v >>> 0, i];
  }
  /* C strtol(s+pos, &end, 10), only called on a digit */
  function strtol10(s, pos) {
    let i = pos, v = 0; while (i < s.length && isDigit(s[i])) { v = v * 10 + (s.charCodeAt(i) - 48); if (v > 2147483647) v = 2147483647; i++; }
    return [v, i];
  }
  const rgbOf = x => [(x >>> 16) & 255, (x >>> 8) & 255, x & 255];
  const clampByte = n => (n < 0 ? 0 : n > 255 ? 255 : n);

  /* parse_rgb: returns [r,g,b] or null */
  function parseRgb(v) {
    if (v[0] === "#" && v.length >= 7) return rgbOf(strtoul16(v, 1)[0]);
    const m = /^\s*([+-]?\d+)\s*,\s*([+-]?\d+)\s*,\s*([+-]?\d+)/.exec(v);
    if (m) return [clampByte(atoi(m[1])), clampByte(atoi(m[2])), clampByte(atoi(m[3]))];
    return null;
  }
  /* parse_rgb_list */
  function parseRgbList(v, max) {
    const out = []; let i = 0, k = 0; const num = [0, 0, 0];
    while (i < v.length && out.length < max) {
      if (v[i] === "#") {
        const [x, e] = strtoul16(v, i + 1);
        const end = e === i + 1 ? i + 1 : e;
        if (end - i >= 7) out.push(rgbOf(x));
        k = 0; i = end;
      } else if (isDigit(v[i])) {
        const [x, e] = strtol10(v, i);
        num[k++] = clampByte(x);
        if (k === 3) { out.push([num[0], num[1], num[2]]); k = 0; }
        i = e;
      } else i++;
    }
    return out;
  }

  const KNOWN = ["intro", "skip", "delay", "smb", "camera", "force_4_3", "volume", "color", "colour", "hue", "saturation", "brightness",
    "cube", "tiles", "tiles_mode", "trail", "logo", "drop", "drop_blend", "glass", "glass_opacity", "background", "bg", "promo_background",
    "text", "letters", "letters_spacing", "image"];

  /* config_load on a string; also reports what the Wii would ignore */
  function parseIni(text) {
    const c = configDefaults(), notes = [];
    const lines = text.split("\n");
    lines.forEach((raw, ln) => {
      let s = raw;
      if (ln === 0 || true) { if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1); }
      const cm = s.indexOf(";"); if (cm >= 0) s = s.slice(0, cm);
      s = trim(s);
      if (!s || s[0] === "[" || s[0] === "#") return;
      const eq = s.indexOf("="); if (eq < 0) { notes.push(T("Line {n}: no \"=\", ignored.", { n: ln + 1 })); return; }
      const k = trim(s.slice(0, eq)), v = trim(s.slice(eq + 1));
      const K = k.toLowerCase();
      const badColour = () => notes.push(T("Line {n}: \"{v}\" is not a color, so {k} falls back to its default.", { n: ln + 1, v, k }));
      const col = (have, key) => { const p = parseRgb(v); c[have] = p ? 1 : 0; if (p) c[key] = p; else badColour(); };
      if (K === "intro") c.intro = eqi(v, "promo") ? 1 : 0;
      else if (K === "skip") c.allow_skip = atoi(v) !== 0 ? 1 : 0;
      else if (K === "camera") c.camera = atoi(v) !== 0 ? 1 : 0;
      else if (K === "force_4_3") c.force_43 = atoi(v) !== 0 ? 1 : 0;
      else if (K === "volume") { const n = atoi(v); c.volume = n < 0 ? 0 : n > 255 ? 255 : n; }
      else if (K === "delay") { const n = atoi(v); c.start_delay = n < 0 ? 0 : n > 10000 ? 10000 : n; }
      else if (K === "color" || K === "colour") {
        c.color_random = eqi(v, "random") ? 1 : 0;
        if (c.color_random) c.have_color = 0; else col("have_color", "color");
      }
      else if (K === "hue") c.hue = atoi(v);
      else if (K === "saturation") c.saturation = atoi(v);
      else if (K === "brightness") c.brightness = atoi(v);
      else if (K === "cube") {
        c.cube_follow = eqi(v, "tiles") || eqi(v, "follow") ? 1 : 0;
        if (c.cube_follow) c.have_cube = 1;
        else { const p = parseRgb(v); c.have_cube = p ? 1 : 0; if (p) c.cube = p; else badColour(); }
      } else if (K === "tiles") {
        c.tiles_rainbow = eqi(v, "rainbow") ? 1 : 0;
        if (c.tiles_rainbow) c.ntiles = 0;
        else {
          const list = parseRgbList(v, MAX_TILES);
          for (let i = 0; i < list.length; i++) c.tiles[i] = list[i];
          c.ntiles = list.length;
          if (!list.length) notes.push(T("Line {n}: no color found in tiles, so the tiles keep their default.", { n: ln + 1 }));
        }
      } else if (K === "tiles_mode") c.tiles_spread = eqi(v, "spread") ? 1 : 0;
      else if (K === "trail") { const n = atoi(v); c.trail = n < 0 ? 0 : n > 16 ? 16 : n; }
      else if (K === "logo") col("have_logo", "logo");
      else if (K === "drop") col("have_drop", "drop");
      else if (K === "drop_blend") c.drop_blend = eqi(v, "jump") ? 1 : eqi(v, "off") ? 2 : 0;
      else if (K === "glass") col("have_glass", "glass");
      else if (K === "glass_opacity") { const n = atoi(v); c.glass_opacity = n < 0 ? 0 : n > 400 ? 400 : n; }
      else if (K === "background" || K === "bg") col("have_background", "background");
      else if (K === "promo_background") col("have_promo_background", "promo_background");
      else if (K === "text") col("have_text", "text");
      else if (K === "letters") {
        let out = "";
        for (let i = 0; i < v.length && out.length < 16; i++) {
          const ch = v[i].toUpperCase();
          if ((ch >= "A" && ch <= "Z") || ch === " ") out += ch;
        }
        c.letters = out;
      } else if (K === "letters_spacing") c.letters_fill = eqi(v, "fill") ? 1 : 0;
      else if (K === "image") c.text_image = v.slice(0, 255);
      else if (K === "smb") c.smb_full = eqi(v, "full") ? 1 : 0;
      else notes.push(T("Line {n}: \"{k}\" is not a setting the program knows, so it is ignored.", { n: ln + 1, k }));
    });
    return { cfg: c, notes };
  }

  /* ---------- the studio's editable model ---------- */
  const INDIGO = [95, 80, 190];
  function modelDefaults() {
    return {
      intro: "ipl", skip: false, camera: true, force_4_3: false, volume: 199, delay: 0, smb: "1-1",
      color: { on: false, random: false, rgb: INDIGO.slice() }, hue: 0, saturation: 100, brightness: 100,
      cube: { mode: "default", rgb: [212, 175, 55] },
      tiles: { mode: "default", list: [[113, 21, 33], [212, 175, 55]] }, tiles_mode: "cycle", trail: 0,
      logo: { on: false, rgb: INDIGO.slice() }, drop: { on: false, rgb: INDIGO.slice() }, drop_blend: "fall",
      glass: { on: false, rgb: INDIGO.slice() }, glass_opacity: 100,
      background: { on: false, rgb: [0, 0, 0] }, promo_background: { on: false, rgb: [0, 0, 0] }, text: { on: false, rgb: [255, 255, 255] },
      letters: "", letters_spacing: "natural", image: "logo.png"
    };
  }
  function modelFromConfig(c) {
    const m = modelDefaults();
    m.intro = c.intro ? "promo" : "ipl"; m.delay = c.start_delay; m.smb = c.smb_full ? "full" : "1-1"; m.skip = !!c.allow_skip; m.camera = !!c.camera; m.force_4_3 = !!c.force_43; m.volume = c.volume;
    const opt = (key, have) => { m[key] = { on: !!c[have], rgb: c[have] ? c[key].slice() : m[key].rgb }; };
    opt("color", "have_color"); opt("logo", "have_logo"); opt("drop", "have_drop"); opt("glass", "have_glass");
    opt("background", "have_background"); opt("promo_background", "have_promo_background"); opt("text", "have_text");
    m.color.random = !!c.color_random;
    m.hue = c.hue; m.saturation = c.saturation; m.brightness = c.brightness;
    m.cube = { mode: c.cube_follow ? "tiles" : c.have_cube ? "color" : "default", rgb: c.have_cube && !c.cube_follow ? c.cube.slice() : m.cube.rgb };
    m.tiles = { mode: c.tiles_rainbow ? "rainbow" : c.ntiles ? "list" : "default", list: c.ntiles ? c.tiles.slice(0, c.ntiles).map(x => x.slice()) : m.tiles.list };
    m.tiles_mode = c.tiles_spread ? "spread" : "cycle"; m.trail = c.trail;
    m.drop_blend = ["fall", "jump", "off"][c.drop_blend]; m.glass_opacity = c.glass_opacity;
    m.letters = c.letters; m.letters_spacing = c.letters_fill ? "fill" : "natural"; m.image = c.text_image;
    return m;
  }
  const rgbStr = c => c.join(",");
  function serialize(m) {
    const L = [];
    L.push("; gc-anim.ini - made with GC-anim-Wii Studio", "[general]");
    L.push(`intro = ${m.intro === "promo" ? "promo" : "ipl"}`, `skip = ${m.skip ? 1 : 0}`, `camera = ${m.camera ? 1 : 0}`, `force_4_3 = ${m.force_4_3 ? 1 : 0}`, `volume = ${m.volume}`, `delay = ${m.delay | 0}`);
    const C = [];
    if (m.color.random) C.push("color = random");
    else if (m.color.on) C.push(`color = ${rgbStr(m.color.rgb)}`);
    if (m.hue) C.push(`hue = ${m.hue}`);
    if (m.saturation !== 100) C.push(`saturation = ${m.saturation}`);
    if (m.brightness !== 100) C.push(`brightness = ${m.brightness}`);
    if (m.cube.mode === "tiles") C.push("cube = tiles");
    else if (m.cube.mode === "color") C.push(`cube = ${rgbStr(m.cube.rgb)}`);
    if (m.tiles.mode === "rainbow") C.push("tiles = rainbow");
    else if (m.tiles.mode === "list" && m.tiles.list.length) {
      C.push(`tiles = ${m.tiles.list.slice(0, MAX_TILES).map(rgbStr).join("  ")}`);
      if (m.tiles.list.length > 1) C.push(`tiles_mode = ${m.tiles_mode}`);
    }
    if (m.trail) C.push(`trail = ${m.trail}`);
    if (m.logo.on) C.push(`logo = ${rgbStr(m.logo.rgb)}`);
    if (m.drop.on) C.push(`drop = ${rgbStr(m.drop.rgb)}`);
    if (m.drop_blend !== "fall") C.push(`drop_blend = ${m.drop_blend}`);
    if (m.glass.on) C.push(`glass = ${rgbStr(m.glass.rgb)}`);
    if (m.glass_opacity !== 100) C.push(`glass_opacity = ${m.glass_opacity}`);
    if (m.background.on) C.push(`background = ${rgbStr(m.background.rgb)}`);
    if (m.promo_background && m.promo_background.on) C.push(`promo_background = ${rgbStr(m.promo_background.rgb)}`);
    if (m.text.on) C.push(`text = ${rgbStr(m.text.rgb)}`);
    if (C.length) L.push("", "[colors]", ...C);
    const T = [];
    if (m.letters.trim() && m.letters.trim() !== "NINTENDO") { T.push(`letters = ${m.letters}`); if (m.letters_spacing === "fill") T.push("letters_spacing = fill"); }
    if (m.image.trim()) T.push(`image = ${m.image.trim()}`);
    if (T.length) L.push("", "[text]", ...T);
    if (m.smb === "full") L.push("", "[smb]", "smb = full");
    return L.join("\n") + "\n";
  }

  /* ---- color = random: port of config_randomize (splitmix32, same draws as the Wii) ---- */
  function randomize(c, seed) {
    let st = seed >>> 0;
    const rng = () => { st = (st + 0x9e3779b9) >>> 0; let z = st; z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0; z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0; return (z ^ (z >>> 16)) >>> 0; };
    const f = Math.fround;
    const rnd = (lo, hi) => lo + (rng() % (hi - lo + 1));
    const rndf = (lo, hi) => f(lo + f(f(hi - lo) * f((rng() >>> 8) / 16777216)));
    const fmod = (a, b) => f(a % b);
    function hsvRgb(h, s, v) {
      const C = f(v * s), m = f(v - C); h = fmod(h, 360); if (h < 0) h = f(h + 360);
      const i = Math.trunc(f(h / 60)), x = f(C * f(1 - Math.abs(f(fmod(f(h / 60), 2) - 1))));
      const [r, g, b] = [[C, x, 0], [x, C, 0], [0, C, x], [0, x, C], [x, 0, C]][i] || [C, 0, x];
      return [r, g, b].map(q => Math.trunc(f(f(f(q + m) * 255) + 0.5)) & 255);
    }
    const rndHsv = h => { const s = rndf(0.55, 1.0), v = rndf(0.70, 1.0); return { h, s, v }; };
    rng(); rng();
    const a = rndHsv(rndf(0, 360));
    c.have_cube = c.cube_follow = 0; c.ntiles = 0; c.tiles_rainbow = 0; c.tiles_spread = 0; c.trail = 0;
    c.have_color = 1; c.color = hsvRgb(a.h, a.s, a.v); c.tiles = [];
    const k = rnd(0, 99), scheme = k < 25 ? 0 : k < 55 ? 1 : k < 70 ? 2 : 3;
    if (scheme === 0) {
      if (rnd(0, 2) === 0) { const b = rndHsv(f(a.h + rndf(120, 240))); c.have_cube = 1; c.cube = hsvRgb(b.h, b.s, b.v); }
      return c;
    }
    if (scheme === 1) {
      const b = rndHsv(f(a.h + f((rnd(0, 1) ? 1 : -1) * rndf(60, 180))));
      const n = rnd(4, MAX_TILES);
      for (let i = 0; i < n; i++) { const t = f(i / (n - 1)); c.tiles[i] = hsvRgb(f(a.h + f(f(b.h - a.h) * t)), f(a.s + f(f(b.s - a.s) * t)), f(a.v + f(f(b.v - a.v) * t))); }
      c.ntiles = n; c.tiles_spread = 1;
    } else if (scheme === 2) {
      const span = f((rnd(0, 1) ? 360 : 180) * (rnd(0, 1) ? 1 : -1));
      for (let i = 0; i < MAX_TILES; i++) c.tiles[i] = hsvRgb(f(a.h + f(f(span * i) / MAX_TILES)), 0.75, f(0.9));
      c.ntiles = MAX_TILES; c.tiles_spread = 1;
    } else {
      const nd = rnd(2, 3), pal = [a];
      for (let i = 1; i < nd; i++) pal[i] = rndHsv(f(f(a.h + f(f(360 / nd) * i)) + rndf(-20, 20)));
      const n = rnd(2, 6);
      for (let i = 0; i < n; i++) { const p = pal[i < nd ? i : rnd(0, nd - 1)]; c.tiles[i] = hsvRgb(p.h, p.s, p.v); }
      c.ntiles = n;
    }
    if (rnd(0, 1)) { c.have_cube = 1; c.cube_follow = 1; }
    c.trail = rnd(0, 2) ? 0 : rnd(1, 4);
    return c;
  }

  G.config = { configDefaults, parseIni, randomize, parseRgb, parseRgbList, modelDefaults, modelFromConfig, serialize, INDIGO, MAX_TILES };
})(GCA);
