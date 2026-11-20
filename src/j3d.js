/* j3d.js - port of source/j3d.c: the IPL's J3D model renderer, driving gx.js */
var GCA = GCA || {};
(function (G) {
  const M = G.gm;
  const P = { ENTRIES: 0, REMAP: 1, NAMES: 2, CULL: 3, MATCOLOR: 4, NCHAN: 5, CHANINFO: 6, NTEXGEN: 7, TEXGEN: 8, TEXMTX: 9, TEXIDX: 10,
    TEVORDER: 11, TEVCOLOR: 12, NTEV: 13, TEVSTAGE: 14, FOG: 15, ALPHACMP: 16, BLEND: 17, ZMODE: 18 };
  const GX_TG_NRM = 1, GX_TEXMTX0 = 30;
  const compSize = t => (t <= 1 ? 1 : t <= 3 ? 2 : 4);

  function load(data) {
    const d = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const u32 = o => d.getUint32(o), u16 = o => d.getUint16(o), s16 = o => d.getInt16(o), f32 = o => d.getFloat32(o);
    const tag = o => String.fromCharCode(data[o], data[o + 1], data[o + 2], data[o + 3]);
    if (String.fromCharCode(...data.slice(0, 8)) !== "J3D1bmd1") return null;
    const m = { data, d, sec: {} };
    let p = 0x20;
    while (p + 8 < data.length) { const sz = u32(p + 4); if (!sz) break; m.sec[tag(p)] = p; p += (sz + 31) & ~31; }
    for (const k of ["INF1", "VTX1", "DRW1", "JNT1", "SHP1", "MAT1", "TEX1"]) if (m.sec[k] === undefined) return null;
    const { INF1, VTX1, DRW1, JNT1, SHP1, MAT1, TEX1 } = m.sec;

    /* INF1 hierarchy */
    m.nodes = [];
    { let q = INF1 + u32(INF1 + 0x14), parent = -1, last = -1; const par = [], lastchild = [];
      for (; u16(q) !== 0; q += 4) {
        const t = u16(q), idx = u16(q + 2);
        if (t === 0x10 || t === 0x11 || t === 0x12) {
          const k = m.nodes.length; m.nodes.push({ type: t, index: idx, child: -1, next: -1 }); par[k] = parent; lastchild[k] = -1;
          if (parent >= 0) { if (m.nodes[parent].child < 0) m.nodes[parent].child = k; else m.nodes[lastchild[parent]].next = k; lastchild[parent] = k; }
          else if (k > 0) { let s = 0; while (m.nodes[s].next >= 0) s = m.nodes[s].next; m.nodes[s].next = k; }
          last = k;
        } else if (t === 1) parent = last;
        else if (t === 2) parent = parent >= 0 ? par[parent] : -1;
      } }
    /* VTX1 */
    const attrs = [9, 10, 25, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], clrSize = [2, 3, 4, 2, 3, 4];
    m.vfmt = []; { let fp = VTX1 + u32(VTX1 + 8); for (; u32(fp) !== 0xFF && m.vfmt.length < 16; fp += 16) m.vfmt.push({ attr: u32(fp), cnt: u32(fp + 4), type: u32(fp + 8), frac: data[fp + 12] }); }
    m.varray = {}; for (let k = 0; k < 13; k++) { const o = u32(VTX1 + 0xC + 4 * k); if (o) m.varray[attrs[k]] = VTX1 + o; }
    m.vstride = {};
    for (const v of m.vfmt) {
      if (v.attr === 9) m.vstride[9] = (v.cnt ? 3 : 2) * compSize(v.type);
      else if (v.attr === 10) m.vstride[10] = 3 * compSize(v.type);
      else if (v.attr === 11 || v.attr === 12) m.vstride[v.attr] = v.type < 6 ? clrSize[v.type] : 4;
      else if (v.attr >= 13 && v.attr <= 20) m.vstride[v.attr] = (v.cnt ? 2 : 1) * compSize(v.type);
    }
    /* JNT1 */
    { const e = JNT1 + u32(JNT1 + 0xC), remap = JNT1 + u32(JNT1 + 0x10); m.joints = [];
      for (let i = 0; i < u16(JNT1 + 8); i++) { const j = e + 0x40 * u16(remap + 2 * i);
        m.joints.push({ scale: [0, 1, 2].map(k => f32(j + 4 + 4 * k)), rot: [0, 1, 2].map(k => s16(j + 0x10 + 2 * k)), trans: [0, 1, 2].map(k => f32(j + 0x18 + 4 * k)) }); } }
    /* DRW1 */
    { const n = u16(DRW1 + 8), o = DRW1 + u32(DRW1 + 0x10); m.drw = []; for (let i = 0; i < n; i++) m.drw.push(u16(o + 2 * i)); }
    /* SHP1 */
    { const s = SHP1, e = s + u32(s + 0xC), remap = s + u32(s + 0x10), vd = s + u32(s + 0x18), dl = s + u32(s + 0x20), grp = s + u32(s + 0x24), pk = s + u32(s + 0x28);
      m.shapes = [];
      for (let i = 0; i < u16(s + 8); i++) {
        const sh = e + 0x28 * u16(remap + 2 * i), g = grp + 8 * u16(sh + 6), pp = pk + 8 * u16(sh + 8), dsc = vd + u16(sh + 4);
        const desc = []; for (let k = 0; u32(dsc + 8 * k) !== 0xFF; k++) desc.push([u32(dsc + 8 * k), u32(dsc + 8 * k + 4)]);
        m.shapes.push({ mtxType: data[sh], desc, drw: u16(g), dl: dl + u32(pp + 4), dlSize: u32(pp) });
      } }
    /* TEX1 */
    m.texHdr = TEX1 + u32(TEX1 + 0xC); m.ntex = Math.min(8, u16(TEX1 + 8));
    m.texobj = []; for (let i = 0; i < m.ntex; i++) { const t = m.texHdr + 0x20 * i; m.texobj.push(texObj(data, t + u32(t + 0x1C), u16(t + 2), u16(t + 4), data[t], data[t + 6], data[t + 7], data[t + 0x15])); }
    /* MAT1 */
    m.mpool = []; for (let i = 0; i < 22; i++) { const o = u32(MAT1 + 0xC + 4 * i); m.mpool[i] = o ? MAT1 + o : -1; }
    m.mats = []; for (let i = 0; i < u16(MAT1 + 8); i++) { const e = m.mpool[P.ENTRIES] + 0x98 * u16(m.mpool[P.REMAP] + 2 * i); m.mats.push({ e, flag: data[e] }); }
    return m;
  }
  function texObj(buf, off, w, h, fmt, wrapS, wrapT, mag) { return { buf, off, w, h, fmt, wrapS, wrapT, linear: mag !== 0 }; }
  function texHeader(m, i) { return m.texHdr + 0x20 * i; }
  function setTexture(m, i, buf, w, h, fmt) {
    if (i < 0 || i >= m.ntex) return;
    const t = texHeader(m, i), d = m.data;
    m.texobj[i] = texObj(buf, 0, w, h, fmt, d[t + 6], d[t + 7], d[t + 0x15]);
  }

  const pool8 = (m, pool, idx, size) => (idx === 0xFF || m.mpool[pool] < 0 ? -1 : m.mpool[pool] + size * idx);
  const pool16 = (m, pool, idx, size) => (idx === 0xFFFF || m.mpool[pool] < 0 ? -1 : m.mpool[pool] + size * idx);
  function getTevColor(m, mi, k) {
    if (mi < 0 || mi >= m.mats.length) return null;
    const p = pool16(m, P.TEVCOLOR, m.d.getUint16(m.mats[mi].e + 0x68 + 2 * k), 8);
    return p < 0 ? null : [m.d.getInt16(p), m.d.getInt16(p + 2), m.d.getInt16(p + 4), m.d.getInt16(p + 6)];
  }
  const readMtx = (d, t) => { const r = M.mtx(); for (let i = 0; i < 12; i++) r[i] = d.getFloat32(t + 4 * i); return r; };

  /* instance: {model, base, jmtx[], alpha, matcolor0?, tevcolor?[mi][k], tex_color_from_ras, shape_hide} */
  function instance(m) { return { model: m, base: M.ident(), jmtx: m.joints.map(() => M.ident()), alpha: 255, matcolor0: null, tevcolor: m.mats.map(() => [null, null, null, null]), tex_color_from_ras: 0, shape_hide: 0 }; }

  function calcNode(inst, n, cur, local) {
    const m = inst.model;
    while (n >= 0) {
      const nd = m.nodes[n]; const c = M.copy(cur, M.mtx());
      if (nd.type === 0x10 && nd.index < m.joints.length) {
        let l;
        if (local) l = M.copy(local[nd.index], M.mtx());
        else { const j = m.joints[nd.index]; l = M.euler(M.mtx(), j.trans[0], j.trans[1], j.trans[2], j.rot[0], j.rot[1], j.rot[2]); if (j.scale[0] !== 1 || j.scale[1] !== 1 || j.scale[2] !== 1) M.scalecols(l, j.scale[0], j.scale[1], j.scale[2]); }
        M.concat(cur, l, c); M.copy(c, inst.jmtx[nd.index]);
      }
      if (nd.child >= 0) calcNode(inst, nd.child, c, local);
      n = nd.next;
    }
  }
  const calcRest = inst => calcNode(inst, 0, inst.base, null);
  const calcLocal = (inst, local) => calcNode(inst, 0, inst.base, local);

  let curMat = null, curModel = null;
  function applyMaterial(gx, inst, mi) {
    const m = inst.model, d = m.d, data = m.data, mat = m.mats[mi], e = mat.e;
    let p, ntev = 0;
    curMat = mat; curModel = m;
    if ((p = pool8(m, P.CULL, data[e + 1], 4)) >= 0) gx.SetCullMode(data[p + 3]);
    if ((p = pool8(m, P.NCHAN, data[e + 2], 1)) >= 0) gx.SetNumChans(data[p]);
    for (let k = 0; k < 2; k++) if ((p = pool16(m, P.MATCOLOR, d.getUint16(e + 8 + 2 * k), 4)) >= 0) {
      let c = [data[p], data[p + 1], data[p + 2], data[p + 3]];
      if (k === 0 && inst.matcolor0) c = inst.matcolor0[mi];
      gx.SetChanMatColor(k ? 5 : 4, c);
    }
    const chanIds = [0, 2, 1, 3];
    for (let k = 0; k < 4; k++) if ((p = pool16(m, P.CHANINFO, d.getUint16(e + 0xC + 2 * k), 8)) >= 0) gx.SetChanCtrl(chanIds[k], data[p], 0, data[p + 1], data[p + 2], data[p + 3], data[p + 4]);
    if ((p = pool8(m, P.NTEXGEN, data[e + 3], 1)) >= 0) {
      const n = data[p]; gx.SetNumTexGens(n);
      for (let k = 0; k < n && k < 8; k++) { const g = pool16(m, P.TEXGEN, d.getUint16(e + 0x14 + 2 * k), 4); if (g >= 0) gx.SetTexCoordGen2(k, data[g], data[g + 1], data[g + 2]); }
    }
    for (let k = 0; k < 10; k++) { const t = pool16(m, P.TEXMTX, d.getUint16(e + 0x24 + 2 * k), 0x34); if (t >= 0) gx.LoadTexMtxImm(readMtx(d, t), GX_TEXMTX0 + 3 * k, data[t + 0x30]); }
    if ((p = pool8(m, P.NTEV, data[e + 4], 1)) >= 0) { ntev = data[p]; gx.SetNumTevStages(ntev); }
    for (let k = 0; k < 4; k++) {
      let c = null;
      if ((p = pool16(m, P.TEVCOLOR, d.getUint16(e + 0x68 + 2 * k), 8)) >= 0) c = [d.getInt16(p), d.getInt16(p + 2), d.getInt16(p + 4), d.getInt16(p + 6)];
      if (inst.tevcolor && inst.tevcolor[mi] && inst.tevcolor[mi][k]) c = inst.tevcolor[mi][k];
      if (c && k < 3) gx.SetTevColorS10(1 + k, c);
    }
    for (let k = 0; k < 8; k++) {
      const s = pool16(m, P.TEVSTAGE, d.getUint16(e + 0x70 + 2 * k), 0x14), o = pool16(m, P.TEVORDER, d.getUint16(e + 0x48 + 2 * k), 4), ti = d.getUint16(e + 0x38 + 2 * k);
      if (s >= 0) {
        const S = i => data[s + i];
        gx.SetTevKColorSel(k, 6); gx.SetTevKAlphaSel(k, 0);
        if (S(0) < 5) gx.SetTevOp(k, S(0));
        else {
          if (inst.tex_color_from_ras && S(1) === 15 && S(2) === 8 && S(3) === 12 && S(4) === 15) gx.SetTevColorIn(k, 15, 15, 15, 10);
          else gx.SetTevColorIn(k, S(1), S(2), S(3), S(4));
          gx.SetTevColorOp(k, S(5), S(6), S(7), S(8), S(9));
          gx.SetTevAlphaIn(k, S(10), S(11), S(12), S(13));
          gx.SetTevAlphaOp(k, S(14), S(15), S(16), S(17), S(18));
        }
      }
      if (o >= 0) gx.SetTevOrder(k, data[o], data[o + 1], data[o + 2]); else gx.SetTevOrder(k, 0xff, 0xff, 0xff);
      if (ti !== 0xFFFF && m.mpool[P.TEXIDX] >= 0) { const t = d.getUint16(m.mpool[P.TEXIDX] + 2 * ti); if (t < m.ntex) gx.LoadTexObj(m.texobj[t], k); }
    }
    if (inst.alpha === 255) {
      gx.SetTevKColor(0, [0, 0, 0, 255]);
      if (mat.flag & 1) gx.SetZMode(1, 3, 1); else gx.SetZMode(0, 3, 0);
    } else {
      gx.SetNumTevStages(ntev + 1);
      gx.SetTevKColor(0, [0, 0, 0, inst.alpha]);
      gx.SetTevKAlphaSel(ntev, 0x1C);
      gx.SetTevColorIn(ntev, 15, 12, 0, 15); gx.SetTevColorOp(ntev, 0, 0, 0, 1, 0);
      gx.SetTevAlphaIn(ntev, 7, 6, 0, 7); gx.SetTevAlphaOp(ntev, 0, 0, 0, 1, 0);
      gx.SetTevOrder(ntev, 0xff, 0xff, 4);
      gx.SetZMode(0, 3, 0);
    }
  }

  function loadShapeState(gx, m, sh, PM) {
    gx.ClearVtxDesc();
    for (const [a, t] of sh.desc) gx.SetVtxDesc(a, t);
    gx.LoadPosMtxImm(PM, 0); gx.LoadNrmMtxImm(M.invXpose(PM), 0);
  }
  function drawShape(gx, inst, si) {
    const m = inst.model, d = m.d, data = m.data, sh = m.shapes[si];
    const PM = M.copy(inst.jmtx[m.drw[sh.drw]], M.mtx());
    if (sh.mtxType === 1) for (let r = 0; r < 3; r++) { const l = Math.hypot(PM[r], PM[4 + r], PM[8 + r]); PM[r] = PM[4 + r] = PM[8 + r] = 0; PM[r * 4 + r] = l; }
    loadShapeState(gx, m, sh, PM);
    if (curMat && curModel === m) {
      const e = curMat.e; let n = 0, done = 0, p;
      if ((p = pool8(m, P.NTEXGEN, data[e + 3], 1)) >= 0) n = data[p];
      for (let k = 0; k < n && k < 8; k++) {
        const g = pool16(m, P.TEXGEN, d.getUint16(e + 0x14 + 2 * k), 4);
        if (g < 0 || data[g + 1] !== GX_TG_NRM || data[g + 2] < GX_TEXMTX0) continue;
        const tk = ((data[g + 2] - GX_TEXMTX0) / 3) | 0;
        if (tk > 9 || done & (1 << tk)) continue;
        done |= 1 << tk;
        const t = pool16(m, P.TEXMTX, d.getUint16(e + 0x24 + 2 * tk), 0x34);
        if (t >= 0) { const R = M.copy(PM, M.mtx()); R[3] = R[7] = R[11] = 0; gx.LoadTexMtxImm(M.concat(readMtx(d, t), R, M.mtx()), GX_TEXMTX0 + 3 * tk, data[t + 0x30]); }
      }
    }
    gx.CallDispList(data, sh.dl, sh.dlSize);
  }
  function drawNodes(gx, inst, n) {
    const m = inst.model;
    while (n >= 0) {
      const nd = m.nodes[n];
      if (nd.type === 0x11 && nd.index < m.mats.length) applyMaterial(gx, inst, nd.index);
      else if (nd.type === 0x12 && nd.index < m.shapes.length && !(nd.index < 32 && (inst.shape_hide >>> nd.index) & 1)) drawShape(gx, inst, nd.index);
      if (nd.child >= 0) drawNodes(gx, inst, nd.child);
      n = nd.next;
    }
  }
  function draw(gx, inst) {
    const m = inst.model;
    for (const v of m.vfmt) { gx.SetVtxAttrFmt(0, v.attr, v.cnt, v.type, v.frac); if (m.varray[v.attr] !== undefined) gx.SetArray(v.attr, m.data, m.varray[v.attr], m.vstride[v.attr]); }
    drawNodes(gx, inst, 0);
  }
  function drawShapeMtx(gx, inst, si, PM) {
    const m = inst.model; if (si < 0 || si >= m.shapes.length) return;
    const sh = m.shapes[si]; loadShapeState(gx, m, sh, PM);
    gx.CallDispList(m.data, sh.dl, sh.dlSize);
  }
  function globalSetup(gx) {
    const I = M.ident();
    gx.SetCullMode(2); gx.SetColorUpdate(1); gx.SetBlendMode(1, 4, 5, 0);
    gx.SetVtxAttrFmt(0, 9, 1, 4, 0); gx.SetVtxAttrFmt(0, 10, 0, 4, 0); gx.SetVtxAttrFmt(0, 11, 1, 5, 0); gx.SetVtxAttrFmt(0, 12, 1, 5, 0);
    for (let i = 0; i < 8; i++) gx.SetVtxAttrFmt(0, 13 + i, 1, 3, 7);
    for (let i = 0; i < 16; i++) gx.SetTevOrder(i, 0xff, 0xff, 0xff);
    gx.SetTevOp(0, 3);
    for (let i = 0; i < 10; i++) { gx.LoadPosMtxImm(I, 3 * i); gx.LoadNrmMtxImm(I, 3 * i); gx.LoadTexMtxImm(I, 30 + 3 * i, 1); }
    gx.SetChanMatColor(4, [255, 255, 255, 255]); gx.SetChanMatColor(5, [255, 255, 255, 255]);
    gx.SetNumChans(1);
    gx.SetChanCtrl(4, 0, 0, 0, 0, 2, 2); gx.SetChanCtrl(5, 0, 0, 0, 0, 2, 2);
    gx.SetNumTexGens(0);
    for (let i = 0; i < 8; i++) gx.SetTexCoordGen2(i, 1, 4 + i, 60);
    gx.ClearVtxDesc(); gx.SetCurrentMtx(0);
  }
  G.j3d = { load, instance, calcRest, calcLocal, draw, applyMaterial: (gx, inst, mi) => { if (mi >= 0 && mi < inst.model.mats.length) applyMaterial(gx, inst, mi); },
    drawShapeMtx, globalSetup, getTevColor, setTexture, texHeader, texObj };
})(GCA);
