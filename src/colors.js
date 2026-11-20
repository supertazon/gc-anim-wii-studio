/* colors.js - port of the colour customisation in source/scene.c
 * (colors_init, tile_target, tile_color_for, cube_color, tile_color). */
var GCA = GCA || {};
(function (G) {
  const f = Math.fround;
  const NT = 16;
  const INDIGO = [95, 80, 190];      /* the small cube's main colour */
  const TILE_RGB = [100, 80, 190];   /* IPL tile colour */

  function lerpRgb(a, b, t) {
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    t = f(t);
    return [0, 1, 2].map(i => Math.trunc(f(f(a[i] + f(f(b[i] - a[i]) * t)) + 0.5)) & 255);
  }

  function colorsInit(c) {
    const R = G.recolor;
    const base = c.have_color ? c.color : null;
    let logoT = base;
    const col = { cfg: c, tileTgt: [], tileFinal: [] };
    col.active = !!(c.have_color || c.hue || c.saturation !== 100 || c.brightness !== 100 ||
      c.have_cube || c.ntiles || c.tiles_rainbow || c.have_logo || c.have_drop || c.have_glass);
    const tileColorFor = t => R.recolorRgb(R.setupTarget(t, c), TILE_RGB);
    const tileTarget = k => {
      if (c.tiles_rainbow) return R.recolorHsv(f(f(18.75) * k), 0.75, f(0.85));
      if (c.ntiles > 0) {
        let i = c.tiles_spread ? Math.trunc((k * c.ntiles) / NT) : k % c.ntiles;
        if (i >= c.ntiles) i = c.ntiles - 1;
        return c.tiles[i];
      }
      return base;
    };
    if (c.have_logo) logoT = c.logo;
    else if (c.tiles_rainbow) logoT = R.recolorHsv(f(18.75 * NT), 0.75, f(0.85));
    else if (c.ntiles > 0) logoT = c.tiles[c.tiles_spread ? c.ntiles - 1 : NT % c.ntiles];
    for (let k = 0; k < NT; k++) {
      const t = tileTarget(k);
      col.tileTgt[k] = (t || INDIGO).slice();
      col.tileFinal[k] = tileColorFor(t);
    }
    col.cubeTgt = (c.have_cube && !c.cube_follow ? c.cube : base || INDIGO).slice();
    col.tileStart = tileColorFor(col.cubeTgt);
    col.dropTgt = (c.have_drop ? c.drop : logoT || INDIGO).slice();
    col.logoT = logoT ? logoT.slice() : null;
    col.glassT = c.have_glass ? c.glass.slice() : col.logoT;
    /* what each target does to the indigo of the models (the colour you will see) */
    col.shown = t => R.recolorRgb(R.setupTarget(t, c), INDIGO);
    col.bg = c.have_background ? c.background.slice() : [0, 0, 0];
    if (c.have_text) col.text = c.text.slice();
    else {
      const l = Math.trunc((299 * col.bg[0] + 587 * col.bg[1] + 114 * col.bg[2]) / 1000);
      col.text = l > 128 ? [0, 0, 0] : [255, 255, 255];
    }
    col.textCustom = !!(c.have_background || c.have_text);
    return col;
  }

  /* progress p = {nlaid, roll_frac, end_fall, end_jump}; returns the cube's main colour */
  function cubeColor(col, p) {
    if (!col.active) return INDIGO.slice();
    return G.recolor.recolorRgb(G.recolor.setupTarget(cubeTarget(col, p), col.cfg), INDIGO);
  }
  /* the target colour cube_color() maps the cube's TEV colours onto */
  function cubeTarget(col, p) {
    const c = col.cfg;
    let t;
    if (c.cube_follow) {
      let b = p.nlaid > 0 ? p.nlaid - 1 : 0, a = b > 0 ? b - 1 : 0;
      if (b >= NT) b = NT - 1;
      if (a >= NT) a = NT - 1;
      t = lerpRgb(col.tileTgt[a], col.tileTgt[b], f(4 * f(p.roll_frac)));
    } else t = col.cubeTgt.slice();
    const e = c.drop_blend === 1 ? p.end_jump : c.drop_blend === 0 ? p.end_fall : 0;
    return lerpRgb(t, col.dropTgt, e);
  }

  /* colour of the tile laid in position seq (0-based) */
  function tileColor(col, p, seq) {
    const c = col.cfg;
    const k = seq < NT ? seq : NT - 1;
    if (c.trail <= 0) return col.tileFinal[k].slice();
    const start = c.cube_follow ? col.tileFinal[k] : col.tileStart;
    let a = f(f(f(p.nlaid - 1 - seq) + f(p.roll_frac)) / f(c.trail));
    const e = c.drop_blend === 1 ? p.end_jump : p.end_fall;
    if (a < e) a = e;
    return lerpRgb(start, col.tileFinal[k], a);
  }

  G.colors = { colorsInit, cubeColor, cubeTarget, tileColor, lerpRgb, NT, INDIGO, TILE_RGB };
})(GCA);
