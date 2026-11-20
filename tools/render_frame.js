#!/usr/bin/env node
/* render_frame.js - renders frames of the boot animation with the studio's own code (headless).
 *
 *   node tools/render_frame.js <ipl.bin> [--ini gc-anim.ini] [--logo logo.png] [--wide] [--out dir] [frames...]
 *
 * Frames are numbered like the studio's scrubber (1 = after the first update); default: the last
 * frame before the fade (with intro = promo in the ini: the promo intro, default its final logo). Writes <out>/frame_NNN.png (592x448, before the VI's horizontal scaling). */
const fs = require("fs"), path = require("path"), vm = require("vm"), zlib = require("zlib");
const SRC = path.join(__dirname, "..", "src");
const MODULES = ["recolor.js", "config.js", "colors.js", "textimg.js", "ipl.js", "gcmath.js", "intro.js", "anim.js", "gx.js", "j3d.js", "letters_data.js", "scene.js", "promo.js"];

function loadStudio() {
  const ctx = { console, atob: s => Buffer.from(s, "base64").toString("binary"), Math, DataView, Uint8Array };
  vm.createContext(ctx);
  for (const m of MODULES) vm.runInContext(fs.readFileSync(path.join(SRC, m), "utf8") + ";this.GCA=GCA;", ctx, { filename: m });
  return ctx.GCA;
}
/* minimal PNG reader (8-bit, non-interlaced; grey, grey+alpha, RGB, RGBA) and writer */
function readPng(file) {
  const b = fs.readFileSync(file); let p = 8, w, h, ct, idat = [];
  while (p < b.length) { const len = b.readUInt32BE(p), type = b.toString("ascii", p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[12] !== 0) throw new Error("only 8-bit non-interlaced PNGs"); ct = d[9]; }
    else if (type === "IDAT") idat.push(d); else if (type === "IEND") break; p += 12 + len; }
  const ch = { 0: 1, 4: 2, 2: 3, 6: 4 }[ct]; if (!ch) throw new Error("unsupported PNG colour type " + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * ch, out = new Uint8Array(w * h * 4), prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) { const a = i >= ch ? cur[i - ch] : 0, up = prev[i], c = i >= ch ? prev[i - ch] : 0; let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += up; else if (ft === 3) v += (a + up) >> 1; else if (ft === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255; }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4, s = x * ch;
      if (ch === 1) out[o] = out[o + 1] = out[o + 2] = cur[s], out[o + 3] = 255;
      else if (ch === 2) out[o] = out[o + 1] = out[o + 2] = cur[s], out[o + 3] = cur[s + 1];
      else { out[o] = cur[s]; out[o + 1] = cur[s + 1]; out[o + 2] = cur[s + 2]; out[o + 3] = ch === 4 ? cur[s + 3] : 255; } }
    prev.set(cur);
  }
  return { rgba: out, w, h };
}
function writePng(file, rgba, w, h) {
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc = buf => { let c = 0xFFFFFFFF; for (const x of buf) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) raw[y * (w * 3 + 1) + 1 + x * 3 + k] = Math.round(rgba[(y * w + x) * 4 + k]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}

const args = process.argv.slice(2); if (!args.length) { console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 8).join("\n")); process.exit(1); }
let ipl = null, ini = "", logo = null, wide = false, out = ".", frames = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--ini") ini = fs.readFileSync(args[++i], "utf8");
  else if (a === "--logo") logo = readPng(args[++i]);
  else if (a === "--wide") wide = true;
  else if (a === "--out") out = args[++i];
  else if (/^\d+$/.test(a)) frames.push(+a);
  else ipl = a;
}
const G = loadStudio();
const buf = fs.readFileSync(ipl);
const res = G.ipl.load(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
if (res.error) { console.error(res.error); process.exit(2); }
console.log(`IPL: ${res.version || "unknown version"}, ${res.scrambled ? "scrambled" : "descrambled"}; text texture ${res.textTex ? res.textTex.w + "x" + res.textTex.h + " fmt " + res.textTex.format : "?"}`);
const { cfg, notes } = G.config.parseIni(ini); notes.forEach(n => console.log("ini: " + n));
if (cfg.color_random) { const seed = (Math.random() * 4294967296) >>> 0; G.config.randomize(cfg, seed); console.log(`color = random: seed ${seed}`); }
const Rn = cfg.intro === 1 ? G.promo : G.scene;
if (!frames.length) frames = [cfg.intro === 1 ? G.promo.MARKS.find(m => m.label === "Final logo").n : G.intro.timeline().lastBeforeFade];
const S = Rn.build(res.assets, cfg, logo);
fs.mkdirSync(out, { recursive: true });
const gx = G.gx.create(G.scene.W, G.scene.H);
for (const n of frames) {
  const t0 = Date.now(); const { rgba } = Rn.render(S, n, wide, gx);
  const f = path.join(out, `frame_${String(n).padStart(3, "0")}.png`); writePng(f, rgba, G.scene.W, G.scene.H);
  console.log(`${f} (${Date.now() - t0} ms)`);
}
