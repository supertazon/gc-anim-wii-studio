/* scene.js - port of source/scene.c (+ the frame loop of main.c and the projection of video.c):
 * builds the four models from the IPL assets with the ini's colours, and renders one frame. */
var GCA = GCA || {};
(function (G) {
  const M = G.gm, J = G.j3d, A = G.anim, R = G.recolor, f = Math.fround;
  const W = 592, H = 448;

  function recolorS10(rc, c) {
    const rgb = R.recolorRgb(rc, [c[0] < 0 ? 0 : c[0] > 255 ? 255 : c[0], c[1] < 0 ? 0 : c[1] > 255 ? 255 : c[1], c[2] < 0 ? 0 : c[2] > 255 ? 255 : c[2]]);
    return [rgb[0], rgb[1], rgb[2], c[3]];
  }
  function recolorRGBA8(rc, d, off, w, h) {
    if (!rc.active) return;
    const blocks = Math.ceil(w / 4) * Math.ceil(h / 4);
    for (let b = 0; b < blocks; b++) {
      const ar = off + 64 * b, gb = ar + 32;
      for (let i = 0; i < 16; i++) {
        const rgb = R.recolorRgb(rc, [d[ar + 2 * i + 1], d[gb + 2 * i], d[gb + 2 * i + 1]]);
        d[ar + 2 * i + 1] = rgb[0]; d[gb + 2 * i] = rgb[1]; d[gb + 2 * i + 1] = rgb[2];
      }
    }
  }
  /* I8 linear -> GX tiled (8x4 blocks) */
  function tileI8(lin, w, h) {
    const out = new Uint8Array(Math.ceil(w / 8) * Math.ceil(h / 4) * 32); let o = 0;
    for (let by = 0; by < h; by += 4) for (let bx = 0; bx < w; bx += 8) for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++)
      out[o++] = by + j < h && bx + i < w ? lin[(by + j) * w + bx + i] : 0;
    return out;
  }
  const glyphCache = {};
  function glyph(ch) {
    if (glyphCache[ch]) return glyphCache[ch];
    const dec = b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Int16Array(u.buffer); };
    const [cap, wall] = G.glyphs[ch];
    return (glyphCache[ch] = { cap: dec(cap), wall: dec(wall) });
  }
  const SLOT_JOINT = s => 10 - s;
  const origFront = c => ({ N: 1, I: 3, T: 7, E: 9, D: 13, O: 15 }[c] ?? -1);

  /* assets: from GCA.ipl.load(); cfg: parsed ini; logo: {rgba, w, h} source image or null */
  function build(assets, cfg, logo) {
    const S = {};
    const model = r => { const m = J.load(new Uint8Array(r)); if (!m) throw new Error("A model could not be read."); const inst = J.instance(m); return { m, inst }; };
    S.letters = model(assets.letters); S.big = model(assets.big_cube); S.cube = model(assets.s_cube); S.logo = model(assets.logo);
    S.bck = A.bckInit(assets.letters_bck); S.ipk = A.ipkInit(assets.letters_ipk);
    if (!S.bck || !S.ipk) throw new Error("The letters' animation could not be read.");
    S.letters.inst.matcolor0 = S.letters.m.mats.map(() => [255, 255, 255, 255]);
    const t = assets.tile_tex, td = new DataView(t.buffer, t.byteOffset, t.byteLength);
    S.tileTex = J.texObj(t, td.getUint32(0x1C), td.getUint16(2), td.getUint16(4), t[0], t[6], t[7], t[0x15]);

    /* colours (colors_init) */
    const col = G.colors.colorsInit(cfg); S.col = col;
    S.cubeOrig = [0, 1].map(k => J.getTevColor(S.cube.m, 0, k));
    const recolorModel = (sm, target, mat0, mat1, kmask, textures) => {
      const rc = R.setupTarget(target, cfg); if (!rc.active) return;
      for (let mi = mat0; mi <= mat1 && mi < sm.m.mats.length; mi++) for (let k = 0; k < 3; k++) {
        if (!(kmask & (1 << k))) continue; const c = J.getTevColor(sm.m, mi, k); if (!c) continue;
        sm.inst.tevcolor[mi][k] = recolorS10(rc, c);
      }
      if (textures) for (let i = 0; i < sm.m.ntex; i++) { const h = J.texHeader(sm.m, i), d = sm.m.data; if (d[h] === 6) recolorRGBA8(rc, d, h + sm.m.d.getUint32(h + 0x1C), sm.m.d.getUint16(h + 2), sm.m.d.getUint16(h + 4)); }
    };
    recolorModel(S.logo, col.logoT, 0, 2, 3, 1);
    recolorModel(S.big, cfg.have_glass ? cfg.glass : col.logoT, 0, 1, 1, 0);
    S.letters.inst.tex_color_from_ras = col.textCustom ? 1 : 0;

    /* custom letters */
    let n = cfg.letters.length; while (n > 0 && cfg.letters[n - 1] === " ") n--;
    S.txt = { n: 0 };
    if (n > 0 && S.letters.m.joints.length >= 11 && S.letters.m.shapes.length >= 16 && S.letters.m.mats.length >= 17) {
      S.txt = { n, ch: cfg.letters.slice(0, n), fill: cfg.letters_fill, m: [], front: [], side: [], frontMat: [], sideMat: [] };
      S.letters.inst.shape_hide = 0xFFFF;
    }
    /* custom logotype: texture 0 of the letters model, as I8 */
    S.textTex = S.letters.m.ntex > 0 ? { w: S.letters.m.d.getUint16(J.texHeader(S.letters.m, 0) + 2), h: S.letters.m.d.getUint16(J.texHeader(S.letters.m, 0) + 4) } : null;
    if (logo && S.textTex) {
      const lin = G.textimg.toI8(logo.rgba, logo.w, logo.h, S.textTex.w, S.textTex.h);
      J.setTexture(S.letters.m, 0, tileI8(lin, S.textTex.w, S.textTex.h), S.textTex.w, S.textTex.h, 1);
    }
    S.locals = S.letters.m.joints.map(() => M.ident());
    S.lettersCol = S.letters.inst.matcolor0;
    return S;
  }

  function lerpCol(a, b, t) { return [0, 1, 2, 3].map(i => Math.trunc(f(f(a[i] + f((b[i] - a[i]) * t)) + 0.5)) & 255); }

  function prepare(S, fr) {
    const col = S.col, L = S.letters;
    for (let j = 0; j < L.m.joints.length && j < S.bck.njoints; j++) A.bckLocal(S.bck, j, fr.letters_frame, S.locals[j]);
    for (let j = 0; j < L.m.mats.length; j++) {
      const c = A.ipkColor(S.ipk, j, fr.letters_frame);
      if (col.textCustom) for (let k = 0; k < 3; k++) c[k] = (col.bg[k] + Math.trunc(((col.text[k] - col.bg[k]) * c[k]) / 255)) & 255;
      S.lettersCol[j] = c;
    }
    M.copy(fr.view, L.inst.base); L.inst.alpha = fr.letters_alpha;
    J.calcLocal(L.inst, S.locals);
    if (S.txt.n) lettersPrepare(S, fr.letters_frame);

    M.copy(fr.big, S.big.inst.base);
    S.big.inst.alpha = Math.min(255, Math.trunc((fr.big_alpha * col.cfg.glass_opacity) / 100));
    J.calcRest(S.big.inst);

    if (col.active) {
      const t = G.colors.cubeTarget(col, fr), rc = R.setupTarget(t, col.cfg);
      for (let k = 0; k < 2; k++) if (S.cubeOrig[k]) S.cube.inst.tevcolor[0][k] = recolorS10(rc, S.cubeOrig[k]);
    }
    M.copy(fr.cube, S.cube.inst.base); S.cube.inst.alpha = fr.cube_alpha; J.calcRest(S.cube.inst);
    M.copy(fr.big, S.logo.inst.base); S.logo.inst.alpha = fr.logo_alpha; J.calcRest(S.logo.inst);
  }

  function lettersPrepare(S, frame) {
    const T = S.txt, n = T.n, tx = [];
    for (let s = 0; s < 8; s++) tx[s] = A.bckSrt(S.bck, SLOT_JOINT(s), frame).T[0];
    const xc = f(0.5 * f(tx[0] + tx[7])), span = f(tx[7] - tx[0]);
    let pitch = n > 1 ? f(span / (n - 1)) : 0;
    if (!T.fill && n <= 8) pitch = f(span / 7);
    for (let k = 0; k < n; k++) {
      const fk = n > 1 ? f(f(7 * k) / (n - 1)) : 3.5;
      let s0 = Math.trunc(fk); if (s0 > 7) s0 = 7;
      const s1 = s0 < 7 ? s0 + 1 : 7, w = f(fk - s0);
      const a = A.bckSrt(S.bck, SLOT_JOINT(s0), frame), b = A.bckSrt(S.bck, SLOT_JOINT(s1), frame);
      const Sx = [], Rx = [], Tx = [];
      for (let i = 0; i < 3; i++) { Sx[i] = f(a.S[i] + f(f(b.S[i] - a.S[i]) * w)); Rx[i] = Math.trunc(f(a.R[i] + f((b.R[i] - a.R[i]) * w))); Tx[i] = f(a.T[i] + f(f(b.T[i] - a.T[i]) * w)); }
      const x = n === 8 ? tx[k] : f(xc + f(f(k - f(0.5 * (n - 1))) * pitch));
      const Lm = M.euler(M.mtx(), x, Tx[1], Tx[2], Rx[0], Rx[1], Rx[2]);
      if (Sx[0] !== 1 || Sx[1] !== 1 || Sx[2] !== 1) M.scalecols(Lm, Sx[0], Sx[1], Sx[2]);
      T.m[k] = M.concat(S.letters.inst.jmtx[2], Lm, M.mtx());
      const sn = w < 0.5 ? s0 : s1;
      T.frontMat[k] = sn; T.sideMat[k] = 16 - sn;
      T.front[k] = lerpCol(S.lettersCol[s0], S.lettersCol[s1], w);
      T.side[k] = lerpCol(S.lettersCol[16 - s0], S.lettersCol[16 - s1], w);
    }
  }

  function drawGenerated(gx, v, m) {
    gx.ClearVtxDesc(); gx.SetVtxDesc(9, 1); gx.SetVtxAttrFmt(2, 9, 1, 3, 8);
    gx.LoadPosMtxImm(m, 0); gx.LoadNrmMtxImm(M.invXpose(m), 0);
    gx.Begin(0x90, 2, v.length / 3);
    for (let i = 0; i < v.length; i += 3) gx.Position3s16(v[i], v[i + 1], v[i + 2]);
    gx.End();
  }
  function lettersDraw(gx, S) {
    const T = S.txt, L = S.letters;
    for (let k = 0; k < T.n; k++) {
      const c = T.ch[k]; if (c < "A" || c > "Z") continue;
      const os = origFront(c), gl = os >= 0 ? null : glyph(c);
      J.applyMaterial(gx, L.inst, T.frontMat[k]); gx.SetChanMatColor(4, T.front[k]);
      if (os >= 0) J.drawShapeMtx(gx, L.inst, os, T.m[k]); else drawGenerated(gx, gl.cap, T.m[k]);
      J.applyMaterial(gx, L.inst, T.sideMat[k]); gx.SetChanMatColor(4, T.side[k]);
      if (os >= 0) J.drawShapeMtx(gx, L.inst, os - 1, T.m[k]); else drawGenerated(gx, gl.wall, T.m[k]);
    }
  }
  function drawTiles(gx, S, fr) {
    const tc = [[0, 0], [0, 0x4000], [0x4000, 0x4000], [0x4000, 0]];
    gx.LoadPosMtxImm(fr.tiles, 0); gx.LoadNrmMtxImm(M.invXpose(fr.tiles), 0); gx.SetCurrentMtx(0);
    gx.ClearVtxDesc(); gx.SetVtxDesc(9, 1); gx.SetVtxAttrFmt(1, 9, 1, 3, 4); gx.SetVtxDesc(13, 1); gx.SetVtxAttrFmt(1, 13, 1, 3, 13);
    gx.SetNumChans(1); gx.SetChanCtrl(4, 0, 0, 0, 0, 2, 2);
    gx.SetNumTexGens(1); gx.SetTexCoordGen2(0, 1, 4, 60);
    gx.SetNumTevStages(1); gx.SetTevOrder(0, 0, 0, 4); for (let i = 1; i < 8; i++) gx.SetTevOrder(i, 0xff, 0xff, 0xff);
    gx.SetTevColorIn(0, 15, 12, 10, 15); gx.SetTevColorOp(0, 0, 0, 0, 1, 0);
    gx.SetTevAlphaIn(0, 7, 4, 5, 7); gx.SetTevAlphaOp(0, 0, 0, 0, 1, 0);
    gx.SetColorUpdate(1); gx.SetBlendMode(1, 4, 5, 0); gx.SetZMode(0, 3, 0); gx.SetCullMode(0);
    const s16 = x => (x << 16) >> 16;
    for (const t of fr.tile) {
      const rgb = G.colors.tileColor(S.col, fr, t.seq);
      const r27 = 54 << 4, r29 = 0, r28 = s16(((t.x - 16) * 54) << 4), r31 = s16(((t.y - 16) * 54) << 4);
      const a0 = s16(-(r28 + r29)), a1 = s16(-(r28 + r27)), b0 = s16(-(r31 + r29)), b1 = s16(-(r31 + r27));
      const p = t.face === 0 ? [[a0, 0, b0], [a1, 0, b0], [a1, 0, b1], [a0, 0, b1]]
        : t.face === 1 ? [[b0, a0, 0], [b0, a1, 0], [b1, a1, 0], [b1, a0, 0]]
        : [[0, b0, a0], [0, b0, a1], [0, b1, a1], [0, b1, a0]];
      gx.SetChanMatColor(4, [rgb[0], rgb[1], rgb[2], t.alpha]);
      gx.LoadTexObj(S.tileTex, 0);
      gx.Begin(0x80, 1, 4);
      for (let v = 0; v < 4; v++) { gx.Position3s16(p[v][0], p[v][1], p[v][2]); gx.TexCoord2s16(tc[v][0], tc[v][1]); }
      gx.End();
    }
  }
  function drawFade(gx, S, alpha) {
    const q = [[-400, 400], [400, 400], [400, -400], [-400, -400]];
    gx.LoadPosMtxImm(M.lookat(M.mtx(), 0, 0, 1700, 0, 1, 0, 0, 0, 0), 0); gx.SetCurrentMtx(0);
    gx.ClearVtxDesc(); gx.SetVtxDesc(9, 1); gx.SetVtxDesc(11, 1); gx.SetVtxAttrFmt(1, 9, 1, 3, 0); gx.SetVtxAttrFmt(1, 11, 1, 5, 0);
    gx.SetNumChans(1); gx.SetChanCtrl(4, 0, 1, 1, 0, 2, 2); gx.SetNumTexGens(0); gx.SetNumTevStages(1);
    gx.SetTevOrder(0, 0xff, 0xff, 4); for (let v = 1; v < 8; v++) gx.SetTevOrder(v, 0xff, 0xff, 0xff);
    gx.SetTevOp(0, 4); gx.SetColorUpdate(1); gx.SetBlendMode(1, 4, 5, 0); gx.SetZMode(0, 7, 0); gx.SetCullMode(0);
    gx.Begin(0x80, 1, 4);
    for (let v = 0; v < 4; v++) { gx.Position3s16(q[v][0], q[v][1], 10); gx.Color4u8(S.col.bg[0], S.col.bg[1], S.col.bg[2], alpha); }
    gx.End();
  }

  /* render frame n (n updates from the start); wide: 16:9. Returns ImageData-compatible RGBA (592x448). */
  function render(S, n, wide, gxIn) {
    const fr = G.intro.frameAt(n);
    prepare(S, fr);
    const gx = gxIn || G.gx.create(W, H);
    gx.clear(S.col.bg);
    gx.SetViewport(0, 0, W + 0.5, H + 0.5, 0, 1);
    let l = -296, r = 292; const t = 224, b = -224, nn = 50, ff = 10000;
    if (wide) { const c = (292 + -296) * 0.5, hw = (292 - -296) * 0.5 * (4 / 3); l = c - hw; r = c + hw; }
    gx.LoadProjectionMtx([2 / (r - l), 0, 0, -(r + l) / (r - l), 0, 2 / (t - b), 0, -(t + b) / (t - b), 0, 0, -1 / (ff - nn), -ff / (ff - nn)], true);
    /* setup_light */
    gx.LoadLightObj({ pos: fr.light, col: [255, 255, 255, 255] }, 1);
    J.globalSetup(gx);
    J.draw(gx, S.letters.inst);
    if (S.txt.n) lettersDraw(gx, S);
    J.globalSetup(gx);
    if (fr.big_alpha > 0) J.draw(gx, S.big.inst);
    drawTiles(gx, S, fr);
    J.draw(gx, S.cube.inst);
    if (fr.logo_alpha > 0) J.draw(gx, S.logo.inst);
    if (fr.fade_alpha > 0) drawFade(gx, S, fr.fade_alpha);
    const out = new Uint8ClampedArray(W * H * 4);
    gx.copyOut(out);
    return { rgba: out, fr };
  }

  G.scene = { build, render, W, H };
})(GCA);
