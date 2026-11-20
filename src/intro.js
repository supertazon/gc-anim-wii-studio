/* intro.js - port of source/intro.c: the boot animation's per-frame logic (60 Hz parameters) */
var GCA = GCA || {};
(function (G) {
  const f = Math.fround, M = G.gm;
  const s16 = x => (x << 16) >> 16;
  const idiv = (a, b) => Math.trunc(a / b);
  const TILE = 54, TILE_HALF = 27;
  const moves = [[0, 1, 5], [0, 1, 255], [3, 1, 255], [3, 1, 255], [5, 1, 255], [0, 2, 255], [0, 2, 255], [3, 2, 255],
    [3, 2, 255], [6, 2, 255], [0, 3, 255], [0, 3, 255], [3, 3, 255], [3, 3, 255], [2, 3, 255], [2, 3, 255], [7, 3, 255], [8, 0, 0]];
  const P60 = {
    n14: 10, n16: 16, n18: 0, n22: 5, n23: 16, n35: 18, n36: 7, n37: 6, n3d: 10, n3e: 20, n54: 40, n57: 60, n58: 5, snd_delay: 0,
    drop_height: 100, jump_height: 130, fall_speed: 30, kA: f(0.93), kB: f(0.925), kickA: 4000, kickB: 12000, phase_step: 1000,
    mA: f(0.015), mB: f(0.005), thrA: 10, thrB: 80, fade_step: 12
  };

  function init(p = P60) {
    const s = {
      p, frame: 0, rotY: 0, wobPhase: 2000, wobAmp: 0, shA: 0, shB: 0, shPhase: 0, hermT: 0x3c, zoom: 0, zoomVel: 0, logoA: 0,
      gx: 16, gy: 18, face: 0, mi: 0, mtype: moves[0][0], done: 0, frm: 0, frm1a: 0, h: p.drop_height, vel: 0,
      grav: f(f(2 * p.drop_height) / (p.n22 * p.n22)), cnt21: 0, c34: 0, c3c: 0, c55: 0, c56: 0,
      y4c: p.jump_height, v40: p.fall_speed, a44: 0, state: 0, next: 0, flagA0: 1, flagA1: 1, flagA2: 1, snd: 0,
      cells: Array.from({ length: 3 }, () => Array.from({ length: 32 }, () => Array.from({ length: 32 }, () => ({ timer: 0, active: 0, st: 0, seq: 0 })))),
      nlaid: 0, fade: 0, finished: 0, cam_sx: 0, cam_sy: 0
    };
    const a44 = f(f(f(2 * p.jump_height) / (p.n3d * p.n3d)) - f(p.fall_speed / p.n3d));
    s.a44 = a44 < 0 ? 0 : a44;
    return s;
  }

  function zoomCamera(s) {
    s.zoomVel = f(s.zoomVel * f(0.8));
    s.zoom = f(s.zoom * f(0.96));
    if (s.zoomVel < 0.1) s.zoomVel = 0;
    if (s.zoom < f(1.035)) s.zoom = 0;
    s.rotY = s16(Math.trunc(M.hermite(s.hermT, 0, 0, 0, 60, 0, 0)));
    s.hermT = s16(s.hermT + 1); if (s.hermT > 0x3c) s.hermT = 0x3c;
  }
  function shakes(s) {
    const p = s.p; let fv;
    if (s.zoomVel <= 0) fv = f(s.wobAmp * f(0.96)); else fv = f(30 + s.wobAmp);
    if (fv < 1) fv = 0;
    if (0 < fv) s.wobPhase = s16(s.wobPhase + 7);
    if (5000 < fv) fv = 5000;
    s.wobAmp = s16(Math.trunc(fv));
    let f1 = f(s.shA * p.kA), f2 = f(s.shB * p.kB);
    if (f1 < p.thrA) f1 = 0;
    if (f2 < p.thrB) f2 = 0;
    if (0 < f1 || 0 < f2) s.shPhase = s16(s.shPhase + p.phase_step);
    s.shA = s16(Math.trunc(f1)); s.shB = s16(Math.trunc(f2));
  }
  function ageTiles(s) {
    for (const face of s.cells) for (const col of face) for (const c of col) {
      if (c.st === 2) { c.st = c.active = c.timer = 0; }
      else if (c.st === 1) c.st = 0;
      else if (c.active && c.timer !== 0xFF) { c.timer = (c.timer - 1) & 255; if (c.timer === 0) c.st = 2; }
    }
  }
  function applyMove(s) {
    const t = s.mtype;
    if (t === 2) s.gx = s.gx < 1 ? 0 : s.gx - 1;
    else if (t === 0) s.gx = s.gx < 0x20 ? s.gx + 1 : 0x20;
    else if (t === 1) s.gy = s.gy < 0x20 ? s.gy + 1 : 0x20;
    else if (t === 3) s.gy = s.gy < 1 ? 0 : s.gy - 1;
    else if (t >= 4 && t < 7) {
      const fc = t - 4;
      if ((fc + 3 - s.face) % 3 === 1 && s.gy === 16) { s.gy = s.gx; s.gx = 16; s.face = fc; }
      if ((fc + 3 - s.face) % 3 === 2 && s.gx === 16) { s.gx = s.gy; s.gy = 16; s.face = fc; }
    }
    ageTiles(s);
    if (s.gx < 32 && s.gy < 32) {
      const c = s.cells[s.face][s.gx][s.gy];
      c.timer = moves[s.mi][2]; c.active = moves[s.mi][1]; c.st = 1;
      c.seq = s.nlaid < 255 ? s.nlaid : 255; s.nlaid++;
    }
  }
  function stepDone(s) {
    const p = s.p; let lim, v;
    if (s.mtype < 4) { lim = 0x4000; v = idiv(s.frm << 14, p.n14 - p.n18); }
    else { lim = 0x8000; v = idiv(s.frm << 15, p.n16 - p.n18); }
    if (lim < v && s.frm1a === 0) s.frm1a = s.frm;
    return s.frm1a > 0 && s.frm1a + p.n18 <= s.frm;
  }
  function drop(s) {
    const p = s.p;
    s.h = f(s.h - s.vel);
    if (s.h < 0) { s.h = 0; if (s.flagA0) { s.shA = p.kickA; s.shPhase = 0x7fff; s.flagA0 = 0; } }
    s.vel = f(s.vel + s.grav);
    if (p.n22 + p.n23 < s.cnt21) { s.flagA0 = 1; return 1; }
    s.cnt21++; return 0;
  }
  function cubeTick(s) {
    const p = s.p;
    s.state = s.next;
    if (s.flagA2 && p.snd_delay < s.snd) s.flagA2 = 0;
    if (s.flagA2) s.snd++;
    switch (s.state) {
      case 0: s.next = drop(s); break;
      case 1:
        if (stepDone(s)) {
          s.frm = 0; s.frm1a = 0; s.mi++;
          if (moves[s.mi][0] === 8) { s.done = 1; ageTiles(s); }
          else { applyMove(s); s.mtype = moves[s.mi][0]; }
        }
        if (s.mtype === 7) s.next = 2; else { s.next = 1; s.frm++; }
        break;
      case 2: s.c34++; s.next = p.n35 + p.n36 < s.c34 ? 3 : 2; break;
      case 3:
        s.y4c = f(s.y4c - s.v40);
        if (s.y4c < 0) { s.y4c = 0; if (s.flagA1) { s.shB = p.kickB; s.shPhase = 0x7fff; s.flagA1 = 0; } }
        s.v40 = f(s.v40 + s.a44);
        if (p.n3d + p.n3e < s.c3c) { s.flagA1 = 1; s.next = 4; }
        else { s.c3c++; s.c56++; if (p.n57 + p.n58 <= s.c56) s.c56 = p.n57 + p.n58; s.next = 3; }
        break;
      case 4:
        s.c55++;
        if (p.n54 < s.c55) { s.c55 = p.n54; s.done = 1; }
        s.logoA = idiv(s.c55 * 255, p.n54);
        s.c56++;
        if (s.c56 < p.n57 + p.n58) s.done = 0; else s.c56 = p.n57 + p.n58;
        if (s.shB !== 0) s.done = 0;
        break;
    }
  }
  function update(s) {
    if (!s.done) zoomCamera(s);
    shakes(s);
    cubeTick(s);
    if (s.done) { s.fade += s.p.fade_step; if (s.fade > 255) { s.fade = 255; s.finished = 1; } }
    s.frame++;
  }

  /* ---- matrices ---- */
  function worldMatrix(s, out) {
    const p = s.p, m = M.mtx(), aux = M.mtx(), t = M.mtx();
    const k = f(f(0 * s.zoom) / 5000), one_k = f(1 - k), k1000 = f(1000 * k);
    const amp = s.wobAmp, ph = s.wobPhase;
    M.trans(aux, 15, 15, 15);
    M.euler(m, 0, 0, 0, 0x2000, s16(0xe6ec), s16(0xeaab));
    M.concat(m, aux, aux);
    const r2 = Math.trunc(f(k1000 + f(one_k * f(amp * M.sin(ph * 0x46)))));
    const r3 = Math.trunc(f(k1000 + f(one_k * f(amp * M.sin(ph * 0x3c)))));
    const r4 = Math.trunc(f(k1000 + f(one_k * f(amp * M.sin(ph * 0x5a)))));
    M.euler(m, 0, 0, 0, r4, r3, r2);
    M.concat(m, aux, m);
    const A = s.shA, B = s.shB, sn = M.sin(s.shPhase);
    const ty = f(f(f(p.mA * A) * sn) + f(f(p.mB * B) * sn));
    const rz = Math.trunc(f(A * sn)), rx = Math.trunc(f(f(-1 * B) * sn));
    M.euler(t, 0, ty, 0, rx, 0, rz); M.concat(t, m, m);
    M.euler(t, 0, 0, 0, 0, s.rotY, 0); M.concat(t, m, m);
    M.ident(t); M.concat(m, t, out);
    const sx = f(1 - f(f(f(1 - 0.5) * s.zoom) / 5000)), sy = f(1 + f(f(1 * s.zoom) / 5000));
    M.scalecols(out, sx, sy, sx);
    return out;
  }
  function camRotation(sx, sy) {
    const r0 = M.lookat(M.mtx(), 200, -200, 200, 0, 1, 0, 0, 0, 0), r1 = M.lookat(M.mtx(), 200 + sx, -200 + sy, 200 - sx, 0, 1, 0, 0, 0, 0), q = M.mtx();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let acc = 0; for (let k = 0; k < 3; k++) acc = f(acc + f(r1[i * 4 + k] * r0[j * 4 + k]));
      q[i * 4 + j] = (i === 2) === (j === 2) ? acc : -acc;
    }
    return q;
  }
  function viewMatrix(s, out) {
    const d = f(224 / f(Math.tan(f(f(f(3.1415927) * 20) / 360))));
    const v = M.lookat(M.mtx(), 0, -55, d, 0, 1, 0, 0, -55, 0);
    if (s.cam_sx || s.cam_sy) {
      const q = camRotation(s.cam_sx, s.cam_sy), t = M.mtx();
      M.trans(t, 0, 0, d); M.concat(t, v, v); M.concat(q, v, v); M.trans(t, 0, 0, -d); M.concat(t, v, out);
    } else M.copy(v, out);
    return out;
  }
  function cubeMatrix(s, W, out) {
    const p = s.p, Mx = M.mtx(), t = M.mtx(), k = (TILE * 3) >> 1;
    if (s.state <= 1) {
      let a, ry = 0;
      if (s.mtype < 4) { a = idiv(s.frm << 14, p.n14 - p.n18); if (a > 0x4000) a = 0x4000; }
      else { a = idiv(s.frm << 15, p.n16 - p.n18); if (a > 0x8000) a = 0x8000; }
      M.ident(Mx);
      M.euler(t, -TILE_HALF, TILE_HALF, -TILE_HALF, 0, 0, 0); M.concat(Mx, t, Mx);
      M.rotaxis(t, "x", s16(a)); M.concat(t, Mx, Mx);
      ry = s.mtype === 2 ? 0x4000 : s.mtype === 0 ? -0x4000 : s.mtype === 1 ? 0x7fff : 0;
      M.trans(t, TILE_HALF, 0, TILE_HALF); M.concat(t, Mx, Mx);
      M.euler(t, -TILE_HALF, 0, -TILE_HALF, 0, ry, 0); M.concat(t, Mx, Mx);
      M.trans(t, -(s.gx - 16) * TILE, 0, -(s.gy - 16) * TILE); M.concat(t, Mx, Mx);
      if (s.face === 1) { M.euler(t, 0, 0, 0, 0x4000, 0, 0x4000); M.concat(t, Mx, Mx); }
      if (s.face === 2) { M.euler(t, 0, 0, 0, 0, -0x4000, -0x4000); M.concat(t, Mx, Mx); }
      M.euler(t, k, k, k, 0, 0, 0); M.concat(t, Mx, Mx);
      M.concat(W, Mx, Mx);
      if (s.state === 0) { M.trans(t, 0, s.h, 0); M.concat(t, Mx, Mx); }
    } else {
      let sc = f(1 + f(f(0.5 * s.c34) / p.n35));
      if (sc > 1.5) sc = 1.5;
      const u1 = (p.n37 * 0x4000) >>> 0;
      let u2 = Math.trunc((u1 * s.c34) / p.n35) >>> 0;
      if (u1 < u2) u2 = u1;
      M.scale(Mx, sc, sc, sc);
      let dv4 = f((TILE >> 1) - f(f(f(f(s.c34 * f(1 + sc)) * TILE) / p.n35) * 0.5));
      const dv3 = -f(f(sc * TILE) * 0.5);
      if (dv4 < dv3) dv4 = dv3;
      const tq = f(f(sc * -TILE) * 0.5);
      M.euler(t, tq, dv4, tq, s16(u2), 0, 0); M.concat(t, Mx, Mx);
      M.euler(t, 0, 0, 0, 0, -0x4000, -0x4000); M.concat(t, Mx, Mx);
      M.euler(t, k, k, k, 0, 0, 0); M.concat(t, Mx, Mx);
      M.concat(W, Mx, Mx);
      let y;
      if (s.state === 2) {
        let u = p.n35 - s.c34; const top = p.jump_height, n4 = p.n35 * p.n35 * p.n35 * p.n35;
        if (u < 0) u = 0;
        y = f(top - f(f(f(f(u * u) * u) * f(top * u)) / n4));
        if (top < y) y = top;
      } else y = s.y4c;
      M.trans(t, 0, y, 0); M.concat(t, Mx, Mx);
    }
    return M.copy(Mx, out);
  }

  function frame(s) {
    const p = s.p, fr = {};
    fr.view = viewMatrix(s, M.mtx());
    fr.world = worldMatrix(s, M.mtx());
    fr.big = M.concat(fr.view, fr.world, M.mtx());
    const t = cubeMatrix(s, fr.world, M.mtx());
    fr.cube = M.concat(fr.view, t, M.mtx());
    M.euler(t, 81, 81, 81, 0, 0, 0); M.concat(fr.world, t, t);
    fr.tiles = M.concat(fr.view, t, M.mtx());
    fr.light = M.multvec(fr.view, [400, 500, 200]);
    const cubeA = idiv((255 - s.logoA) * 255, 255);
    fr.cube_alpha = idiv(255 * cubeA, 255);
    let a = s.shA + s.shB; if (a > 3000) a = 3000;
    fr.big_alpha = idiv(255 * a, 3000);
    fr.logo_alpha = s.logoA; fr.letters_alpha = 255;
    fr.letters_frame = p.n58 < s.c56 ? f(60 * f((s.c56 - p.n58) / p.n57)) : 0;
    fr.tile = [];
    for (let face = 0; face < 3; face++) for (let x = 0; x < 32; x++) for (let y = 0; y < 32; y++) {
      const c = s.cells[face][x][y]; let al = 255;
      if (!c.active) continue;
      if (c.st === 1) al = idiv(s.frm * 255, p.n14);
      if (c.st === 2) al = idiv((p.n14 - s.frm) * 255, p.n14);
      if (al > 255) al = 255; if (al < 0) al = 0;
      al = idiv(al * cubeA, 255);
      if (fr.tile.length < 64) fr.tile.push({ face, x, y, alpha: al & 255, seq: c.seq });
    }
    fr.fade_alpha = s.fade > 0 && !s.finished ? s.fade : 0;
    fr.nlaid = s.nlaid; fr.roll_frac = 1;
    if (s.state <= 1 && !s.done) {
      const len = s.mtype < 4 ? p.n14 : p.n16;
      fr.roll_frac = s.state === 0 ? 0 : f(s.frm / len);
      if (fr.roll_frac > 1) fr.roll_frac = 1;
    }
    fr.end_fall = 0; fr.end_jump = 0;
    if (s.state === 2) { const r = f(s.c34 / (p.n35 + p.n36)); fr.end_jump = f(0.8 * (r > 1 ? 1 : r)); }
    else if (s.state >= 3) { const r = s.state === 3 ? f(1 - f(s.y4c / p.jump_height)) : 1; fr.end_fall = r; fr.end_jump = f(f(0.8) + f(f(0.2) * r)); }
    fr.state = s.state; fr.frameNo = s.frame;
    return fr;
  }

  /* run the whole animation once: returns the per-frame snapshots' count and the index of the
   * last frame before the fade (frames are numbered from 1 = after the first update) */
  function timeline() {
    const s = init(); let n = 0, lastBeforeFade = 0;
    while (!s.finished && n < 2000) { update(s); if (s.finished) break; n++; if (s.fade === 0) lastBeforeFade = n; }
    return { frames: n, lastBeforeFade };
  }
  /* state after n updates (simulation from scratch; cheap) */
  function frameAt(n) { const s = init(); for (let i = 0; i < n; i++) update(s); return frame(s); }

  G.intro = { init, update, frame, timeline, frameAt, P60 };
})(GCA);
