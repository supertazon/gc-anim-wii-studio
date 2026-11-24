/* app.js - GC-anim-Wii Studio UI */
(function () {
const G = GCA, $ = id => document.getElementById(id), t = (s, v) => G.t(s, v);
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const hex = c => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
const unhex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const css = c => `rgb(${c[0]},${c[1]},${c[2]})`;
let downloads = null;
(async () => { try { downloads = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { downloads = null; } })();
async function offerFile(filename, data, fallbackBox, msgEl, fallbackFill) {
  if (!window.claude) {
    /* plain web page (e.g. GitHub Pages): a normal download */
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const link = document.createElement("a"); link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    msgEl.textContent = t("Saved {file}.", { file: filename }); return;
  }
  if (downloads) {
    try { await downloads.save({ filename, data }); msgEl.textContent = t("Saved {file}.", { file: filename }); return; }
    catch (err) {
      if (err && err.code === "declined") { msgEl.textContent = t("Save cancelled."); return; }
      if (err && err.code === "rate_limited") { msgEl.textContent = t("A save prompt is already open."); return; }
    }
  }
  fallbackFill(); fallbackBox.hidden = false; msgEl.textContent = "";
}

/* ---------------- theme (dark by default) ---------------- */
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
function setTheme(th) {
  document.documentElement.dataset.theme = th;
  try { localStorage.setItem("gcas-theme", th); } catch (e) {}
  const b = $("themeBtn"), label = th === "dark" ? t("Switch to light theme") : t("Switch to dark theme");
  b.innerHTML = th === "dark" ? SUN : MOON; b.setAttribute("aria-label", label); b.title = label;
}
$("themeBtn").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");

/* ---------------- tabs ---------------- */
const tabs = [["tabBtnAnim", "tabAnim"], ["tabBtnLogo", "tabLogo"]];
function showTab(id, keep) {
  for (const [b, p] of tabs) { const on = b === id; $(b).setAttribute("aria-selected", on); $(p).hidden = !on; }
  if (!keep) store.set("gcas-tab", id);
  if (id === "tabBtnLogo") scheduleLogo(); else scheduleAnim();
}
tabs.forEach(([b]) => $(b).addEventListener("click", () => showTab(b)));

/* =============================================================== */
/*  Animation settings (gc-anim.ini model)                          */
/* =============================================================== */
let M = Object.assign(G.config.modelDefaults(), store.get("gcas-model-v1", {}));
let iniNotes = [];
let extI8 = null, extName = "", extSrc = null;

const OPT = [["color", "Theme color"], ["drop", "Drop color"], ["logo", "Logo color"], ["glass", "Glass color"], ["background", "Background"], ["promo_background", "Promo background"], ["text", "Text color"]];
for (const [key, label] of OPT) {
  const box = $("opt-" + key);
  box.className = "optrow";
  box.innerHTML = `<span>${t(label)}</span><label class="chk"><input type="checkbox" id="m-${key}On"> <span>${t("Set")}</span></label><input type="color" id="m-${key}Rgb" aria-label="${t(label)}"><small id="m-${key}Txt" data-no-i18n></small>`;
  $(`m-${key}On`).addEventListener("input", e => { M[key].on = e.target.checked; changed(); });
  $(`m-${key}Rgb`).addEventListener("input", e => { M[key].rgb = unhex(e.target.value); M[key].on = true; if (key === "color") M.color.random = false; changed(); });
}
const simple = { hue: "num", saturation: "num", brightness: "num", trail: "num", glass_opacity: "num", volume: "num",
  drop_blend: "str", tiles_mode: "str", letters_spacing: "str", intro: "str", smb: "str", delay: "num", image: "str", skip: "bool", camera: "bool", force_4_3: "bool" };
for (const [k, t] of Object.entries(simple)) {
  const el = $("m-" + k);
  el.addEventListener("input", () => { M[k] = t === "num" ? +el.value : t === "bool" ? el.checked : el.value; changed(); });
}
$("m-letters").addEventListener("input", e => {
  const clean = [...e.target.value.toUpperCase()].filter(ch => (ch >= "A" && ch <= "Z") || ch === " ").join("").slice(0, 16);
  if (clean !== e.target.value) e.target.value = clean;
  M.letters = clean; changed();
});
let randSeed = (Math.random() * 4294967296) >>> 0;
$("m-colorRandom").addEventListener("input", e => { M.color.random = e.target.checked; changed(); });
$("reroll").addEventListener("click", () => { randSeed = (Math.random() * 4294967296) >>> 0; changed(); });
/* the settings as the program sees them; with color = random, one draw of the scheme */
function effCfg() {
  const c = G.config.parseIni(G.config.serialize(M)).cfg;
  if (c.color_random) G.config.randomize(c, randSeed);
  return c;
}
$("m-cubeMode").addEventListener("input", e => { M.cube.mode = e.target.value; changed(); });
$("m-cubeRgb").addEventListener("input", e => { M.cube.rgb = unhex(e.target.value); M.cube.mode = "color"; changed(); });
$("m-tilesMode").addEventListener("input", e => { M.tiles.mode = e.target.value; changed(); });
$("tileAdd").addEventListener("click", () => {
  if (M.tiles.list.length >= 16) return;
  M.tiles.list.push((M.tiles.list[M.tiles.list.length - 1] || [255, 255, 255]).slice()); M.tiles.mode = "list"; changed();
});
$("resetModel").addEventListener("click", () => { M = G.config.modelDefaults(); iniNotes = []; changed(); });

function buildTileList() {
  const box = $("tileList");
  box.replaceChildren(...M.tiles.list.map((c, i) => {
    const it = document.createElement("span"); it.className = "item";
    const n = document.createElement("span"); n.textContent = i + 1;
    const inp = document.createElement("input"); inp.type = "color"; inp.value = hex(c); inp.id = "tilecol-" + i; inp.setAttribute("aria-label", t("Tile color {n}", { n: i + 1 }));
    inp.addEventListener("input", () => { M.tiles.list[i] = unhex(inp.value); changed(false); });
    const del = document.createElement("button"); del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", t("Remove color {n}", { n: i + 1 }));
    del.disabled = M.tiles.list.length <= 1;
    del.addEventListener("click", () => { M.tiles.list.splice(i, 1); changed(); });
    it.append(n, inp, del); return it;
  }));
  $("tileCount").textContent = t("{n} of 16", { n: M.tiles.list.length });
  $("tileAdd").disabled = M.tiles.list.length >= 16;
}

function syncModelUI(rebuildList) {
  for (const [key] of OPT) {
    $(`m-${key}On`).checked = M[key].on; $(`m-${key}Rgb`).value = hex(M[key].rgb);
    $(`m-${key}Txt`).textContent = M[key].on ? M[key].rgb.join(",") : t("not set");
  }
  for (const [k, t] of Object.entries(simple)) { const el = $("m-" + k); if (t === "bool") el.checked = M[k]; else el.value = M[k]; }
  document.querySelectorAll("output[data-m]").forEach(o => { const k = o.dataset.m; o.textContent = M[k] + (k === "glass_opacity" || k === "saturation" || k === "brightness" ? "%" : k === "hue" ? "°" : k === "delay" ? " ms" : ""); });
  $("m-letters").value = M.letters;
  $("m-colorRandom").checked = !!M.color.random; $("reroll").hidden = !M.color.random;
  document.body.classList.toggle("promo", M.intro === "promo"); document.body.classList.toggle("random", !!M.color.random);
  document.querySelectorAll("[data-ipl-only]").forEach(el => el.classList.toggle("na", M.intro === "promo"));
  document.querySelectorAll("[data-random-over]").forEach(el => el.classList.toggle("na", M.intro === "promo" || !!M.color.random));
  $("m-cubeMode").value = M.cube.mode; $("m-cubeRgb").value = hex(M.cube.rgb);
  $("cubeRgbRow").hidden = M.cube.mode !== "color"; $("cubeRgbTxt").textContent = M.cube.rgb.join(",");
  $("m-tilesMode").value = M.tiles.mode; $("tileListBox").hidden = M.tiles.mode !== "list";
  $("m-tiles_mode").disabled = M.tiles.list.length < 2;
  if (rebuildList !== false) buildTileList();
}
function changed(rebuildList) { syncModelUI(rebuildList); store.set("gcas-model-v1", M); scheduleAnim(); sceneDirty = true; if (IPL && shownMode !== modeNow()) showIpl(); else requestRender(); }


/* ---- quick presets (tiles, cube, trail) ---- */
/* color fields back to the program's defaults (letters, image and general settings untouched) */
function resetColors(m) {
  const d = G.config.modelDefaults();
  for (const k of ["color", "hue", "saturation", "brightness", "cube", "tiles", "tiles_mode", "trail", "logo", "drop", "drop_blend", "glass", "glass_opacity", "background", "promo_background", "text"]) m[k] = d[k];
}
const on = rgb => ({ on: true, rgb });
const BLACK = [40, 40, 45], SILVER = [175, 178, 186], WHITE = [255, 255, 255], STRIPE_W = [235, 235, 238];
const HW_PRESETS = [
  { name: "Jet Black", sw: [BLACK], set: m => { m.color = on(BLACK); m.background = on(WHITE); } },
  { name: "Platinum Silver", sw: [SILVER], set: m => { m.color = on(SILVER); } },
  { name: "Spice Orange", sw: [[240, 120, 30]], set: m => { m.color = on([240, 120, 30]); } },
  { name: "Pearl White", sw: [[228, 228, 234]], set: m => { m.color = on([228, 228, 234]); } },
  /* top of the G silver, bottom black, like the console's two-tone case; the cube follows the tiles */
  { name: "Resident Evil 4 Edition", sw: [SILVER, BLACK], set: m => {
    m.tiles = { mode: "list", list: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(k => (k >= 6 && k <= 11 ? BLACK : SILVER).slice()) };
    m.cube = { mode: "tiles", rgb: m.cube.rgb }; m.logo = on(SILVER); m.background = on([120, 120, 124]); } },
  { name: "Symphonic Green", sw: [[64, 160, 150]], set: m => { m.color = on([64, 160, 150]); } },
  /* black and white tiles chosen by their column on screen, so the finished G reads as vertical stripes */
  { name: "Vertical Stripes (Hanshin Tigers)", sw: [BLACK, STRIPE_W], set: m => {
    m.tiles = { mode: "list", list: "WBWBBBBWBWBWWWBW".split("").map(c => (c === "B" ? BLACK : STRIPE_W).slice()) };
    m.cube = { mode: "tiles", rgb: m.cube.rgb }; m.logo = on(BLACK); m.background = on([128, 128, 132]); m.promo_background = on(STRIPE_W); } },
  { name: "Char's Custom Color", sw: [[200, 70, 35]], set: m => { m.color = on([200, 70, 35]); } }
];
const ANIM_PRESETS = [
  { name: "2 colors", list: [[113, 21, 33], [212, 175, 55]], trail: 4 },
  { name: "3 colors", list: [[0, 85, 164], [255, 255, 255], [239, 65, 53]], trail: 4 },
  { name: "4 colors", list: [[0, 160, 233], [230, 0, 18], [255, 204, 0], [0, 166, 81]], trail: 4 },
  { name: "Rainbow", rainbow: true, trail: 4, sw: [[230, 60, 60], [240, 200, 40], [60, 190, 90], [60, 120, 230], [170, 80, 210]] }
];
function applyHwPreset(p) { resetColors(M); p.set(M); iniNotes = []; changed(); }
function applyAnimPreset(p) {
  M.tiles = p.rainbow ? { mode: "rainbow", list: M.tiles.list } : { mode: "list", list: p.list.map(c => c.slice()) };
  M.tiles_mode = "cycle"; M.cube = { mode: "tiles", rgb: M.cube.rgb }; M.trail = p.trail;
  M.logo.on = false; M.drop.on = false; M.glass.on = false; M.color.random = false;
  const d = G.config.modelDefaults(); M.background = d.background; M.promo_background = d.promo_background; M.text = d.text;
  iniNotes = []; changed();
}
/* everything as the program does without an ini: original colors, original GAMECUBE logotype */
function applyDefault() {
  resetColors(M); M.image = ""; M.letters = "NINTENDO"; M.letters_spacing = "natural";
  $("useLogo").checked = false; $("bundleLogo").checked = false;
  iniNotes = []; changed();
}
function presetChip(p, onClick) {
  const b = document.createElement("button"); b.type = "button"; b.className = "pchip";
  const cols = p.sw || p.list;
  if (cols) {
    const sw = document.createElement("span"); sw.style.cssText = "display:inline-flex;gap:2px;margin-right:6px;vertical-align:-2px";
    for (const c of cols) { const d = document.createElement("i"); d.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:2px;background:rgb(${c});box-shadow:inset 0 0 0 1px rgba(128,128,128,.55)`; sw.append(d); }
    b.append(sw);
  }
  b.append(t(p.name)); b.addEventListener("click", onClick); return b;
}
function buildAnimPresets() {
  $("hwPresets").replaceChildren(...HW_PRESETS.map(p => presetChip(p, () => applyHwPreset(p))));
  $("animPresets").replaceChildren(...ANIM_PRESETS.map(p => presetChip(p, () => applyAnimPreset(p))));
}
$("presetDefault").addEventListener("click", applyDefault);
buildAnimPresets();

/* ---- import ---- */
function applyIni(text, source) {
  const { cfg, notes } = G.config.parseIni(text);
  M = G.config.modelFromConfig(cfg);
  iniNotes = [t("Loaded {source}.", { source }), ...notes];
  changed();
}
$("iniFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader(); r.onload = () => applyIni(String(r.result), f.name); r.readAsText(f); e.target.value = "";
});
$("iniApply").addEventListener("click", () => { if ($("iniPaste").value.trim()) applyIni($("iniPaste").value, t("the pasted ini")); });
$("iniCopy").addEventListener("click", async () => {
  const t = $("iniOut");
  try { await navigator.clipboard.writeText(t.value); $("iniCopy").textContent = t("Copied"); setTimeout(() => ($("iniCopy").textContent = t("Copy")), 1500); }
  catch (e) { t.focus(); t.select(); }
});
$("extImg").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const data = x.getImageData(0, 0, c.width, c.height).data;
    extI8 = G.textimg.toI8(data, c.width, c.height, 352, 40); extSrc = { rgba: data, w: c.width, h: c.height };
    extName = f.name; scheduleAnim(); sceneDirty = true; requestRender(); URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(f); e.target.value = "";
});
$("extClear").addEventListener("click", () => { extI8 = null; extSrc = null; extName = ""; scheduleAnim(); sceneDirty = true; requestRender(); });

/* ---- color board ---- */
const STAGES = [];
for (let n = 1; n <= 16; n++) STAGES.push({ label: "Roll {n}", vars: { n }, short: String(n), p: { nlaid: n, roll_frac: 0.5, end_fall: 0, end_jump: 0 } });
STAGES.push({ label: "Rise", short: "Rise", sep: true, p: { nlaid: 16, roll_frac: 1, end_fall: 0, end_jump: 0.25 } });
STAGES.push({ label: "Top of the jump", short: "Peak", p: { nlaid: 16, roll_frac: 1, end_fall: 0, end_jump: 0.5 } });
STAGES.push({ label: "Fall", short: "Fall", p: { nlaid: 16, roll_frac: 1, end_fall: 0.5, end_jump: 0.75 } });
STAGES.push({ label: "Landed", short: "Land", p: { nlaid: 16, roll_frac: 1, end_fall: 1, end_jump: 1 } });

let animPending = false;
function scheduleAnim() { if (animPending) return; animPending = true; requestAnimationFrame(() => { animPending = false; renderAnim(); }); }
let currentCol = null;
function colNow() {
  const ini = G.config.serialize(M);
  const cfg = effCfg();
  return { ini, cfg, col: G.colors.colorsInit(cfg) };
}
function swatch(name, rgb, src) {
  const d = document.createElement("div"); d.className = "sw";
  d.innerHTML = `<div class="chip" style="background:${css(rgb)}"></div><b></b><small></small>`;
  d.querySelector("b").textContent = t(name); d.querySelector("small").textContent = `${rgb.join(",")} · ${src}`;
  return d;
}
function renderAnim() {
  const { ini, cfg, col } = colNow(); currentCol = col;
  $("iniOut").value = ini;
  $("iniNotes").replaceChildren(...iniNotes.map((t, i) => { const p = document.createElement("div"); p.className = i === 0 ? "okmsg" : "warn"; p.textContent = t; return p; }));

  const P0 = { nlaid: 1, roll_frac: 0, end_fall: 0, end_jump: 0 };
  const theme = M.color.random ? t("random draw") : cfg.have_color ? t("theme") : t("original");
  const after = cfg.tiles_rainbow || cfg.ntiles ? t("after the last tile") : theme;
  $("swatches").replaceChildren(
    swatch("Small cube", G.colors.cubeColor(col, P0), cfg.cube_follow ? t("follows the tiles") : cfg.have_cube ? t("own color") : theme),
    swatch("Drop", col.shown(col.dropTgt), cfg.drop_blend === 2 ? t("unused (blend off)") : cfg.have_drop ? t("own color") : t("logo color")),
    swatch("Logo", col.shown(col.logoT), cfg.have_logo ? t("own color") : after),
    swatch("Glass flashes", col.shown(col.glassT), `${cfg.have_glass ? t("own color") : t("logo color")} · ${cfg.glass_opacity}%`),
    swatch("Background", col.bg, cfg.have_background ? t("own color") : t("default")),
    swatch("Text", col.text, cfg.have_text ? t("own color") : t("automatic")));
  $("tiles").replaceChildren(...col.tileFinal.map((c, i) => { const d = document.createElement("div"); d.className = "tile"; d.style.background = css(c); d.title = t("Tile {n}", { n: i + 1 }) + `: ${c.join(",")}`; d.innerHTML = `<span>${i + 1}</span>`; return d; }));

  /* timeline */
  const tl = $("timeline"), cells = [];
  tl.style.gridTemplateColumns = `3.6rem repeat(${STAGES.length}, minmax(14px,1fr))`;
  cells.push(document.createElement("div"));
  for (const s of STAGES) { const h = document.createElement("div"); h.className = "h" + (s.sep ? " sep" : ""); h.textContent = t(s.short); h.title = t(s.label, s.vars); cells.push(h); }
  const rowHead = t => { const d = document.createElement("div"); d.className = "rh"; d.textContent = t; return d; };
  cells.push(rowHead(t("Cube")));
  for (const s of STAGES) { const c = document.createElement("div"); c.className = "c" + (s.sep ? " sep" : ""); const v = G.colors.cubeColor(col, s.p); c.style.background = css(v); c.title = `${t("Cube")}, ${t(s.label, s.vars)}: ${v.join(",")}`; cells.push(c); }
  for (let k = 0; k < 16; k++) {
    cells.push(rowHead(t("Tile {n}", { n: k + 1 })));
    for (const s of STAGES) {
      const c = document.createElement("div"); c.className = "c" + (s.sep ? " sep" : "");
      if (k < s.p.nlaid) { const v = G.colors.tileColor(col, s.p, k); c.style.background = css(v); c.title = `${t("Tile {n}", { n: k + 1 })}, ${t(s.label, s.vars)}: ${v.join(",")}`; }
      else c.classList.add("empty");
      cells.push(c);
    }
  }
  tl.replaceChildren(...cells);

  /* scene strip: the logotype as the Wii shows it, on the background */
  const i8 = extI8 || (logoRes && logoRes.i8);
  const sc = $("sceneCv").getContext("2d"), img = sc.createImageData(352, 40);
  if (i8) G.logo.composite(i8, col, img.data);
  else for (let i = 0; i < img.data.length; i += 4) { img.data[i] = col.bg[0]; img.data[i + 1] = col.bg[1]; img.data[i + 2] = col.bg[2]; img.data[i + 3] = 255; }
  sc.putImageData(img, 0, 0);
  $("extClear").hidden = !extI8;
  const imgName = M.image.trim();
  $("imgNote").textContent = extI8 ? t("Previewing {file}, fitted the way the program fits it.", { file: extName }) :
    imgName && imgName.toLowerCase() !== "logo.png" ? t("The program will load {file}. The preview shows the Logotype tab's image; load {file} above to preview it instead.", { file: imgName }) :
    t("Shows the image from the Logotype tab.");

  /* letters */
  const word = M.letters.trim() ? M.letters.replace(/\s+$/, "") : "NINTENDO";
  $("lettersView").replaceChildren(...[...word].map(ch => {
    const s = document.createElement("span");
    if (ch === " ") { s.className = "lt gap"; return s; }
    s.className = "lt" + ("NITEDO".includes(ch) ? " ipl" : ""); s.textContent = ch;
    s.title = "NITEDO".includes(ch) ? t("Letter from your IPL") : t("Letter from the original alphabet"); return s;
  }));
  const n = word.length;
  $("lettersNote").textContent = (M.letters.trim() ? "" : t("Original letters.") + " ") + t("Dashed letters come from your IPL, solid ones from the program's own alphabet.") + " " +
    (M.letters_spacing === "fill" ? t("Spread over NINTENDO's width.") : n > 8 ? t("More than 8 letters: squeezed to NINTENDO's width.") : t("NINTENDO's letter pitch, centered."));
  $("act1cap").textContent = (cfg.have_background ? t("1:1 on your background") : t("1:1 on black")) + (col.textCustom ? ", " + t("text {rgb}", { rgb: col.text.join(",") }) : "");
  if (!$("tabLogo").hidden) drawLogoPreviews();
}

/* =============================================================== */
/*  Logotype                                                        */
/* =============================================================== */
const LDEF = {
  text: "HOMEBREW", upper: true, capPct: 95, vOff: 0, margin: 8, align: "center",
  spacing: "optical", tight: 0.16, track: 0, wordGap: 0.4, kerns: {},
  fillMode: "gradient", lTop: 100, lMid: 85, lBot: 72, useMid: false,
  bevelOn: true, bevelW: 1.25, bevelS: 0.6, lightA: 120, lightE: 45,
  outOn: false, outL: 100, outW: 0.75, glowOn: false, glowL: 100, glowR: 2.5, glowA: 0.5,
  tmOn: true, tmPos: "bottom", tmScale: 0.26, tmGap: 0.06,
  refA: 0.5, ss: 4, view: "wii", zoom: 2, flicker: false
};
let S = Object.assign({}, LDEF, store.get("gcas-logo-v1", {}));
/* new defaults (v2): move settings still at the old defaults */
if (store.get("gcas-logo-defaults", 1) < 2) { if (S.capPct === 62) S.capPct = LDEF.capPct; if (S.tmPos === "top") S.tmPos = LDEF.tmPos; store.set("gcas-logo-defaults", 2); }
S.zoom = LDEF.zoom;
let fontFamily = "Michroma", fontLabel = null, fontSerial = 0, refImg = null, logoRes = null;
const ids = ["text", "upper", "capPct", "vOff", "margin", "align", "spacing", "tight", "track", "wordGap", "fillMode", "lTop", "lMid", "lBot", "useMid",
  "bevelOn", "bevelW", "bevelS", "lightA", "lightE", "outOn", "outL", "outW", "glowOn", "glowL", "glowR", "glowA", "tmOn", "tmPos", "tmScale", "tmGap", "refA", "ss"];
const fmt = { capPct: v => v + "%", vOff: v => (+v).toFixed(2) + "px", margin: v => v + "px", bevelW: v => (+v).toFixed(2) + "px", outW: v => (+v).toFixed(2) + "px",
  glowR: v => (+v).toFixed(1) + "px", lightA: v => v + "°", lightE: v => v + "°", lTop: v => v + "%", lMid: v => v + "%", lBot: v => v + "%", outL: v => v + "%", glowL: v => v + "%",
  tight: v => (+v).toFixed(3), track: v => (+v).toFixed(3) };
const showVal = k => (fmt[k] ? fmt[k](S[k]) : (+S[k]).toFixed(2));
function syncLogoUI() {
  for (const id of ids) { const el = $(id); if (el.type === "checkbox") el.checked = !!S[id]; else el.value = S[id]; }
  $("viewSel").value = S.view; $("zoomSel").value = String(S.zoom); $("flicker").checked = S.flicker;
  document.querySelectorAll("output[data-for]").forEach(o => (o.textContent = showVal(o.dataset.for)));
  $("fontName").textContent = fontLabel || t("Michroma (built-in sample font)");
  $("fontReset").hidden = !fontLabel;
  const solid = S.fillMode === "solid";
  $("lMid").disabled = solid || !S.useMid; $("lBot").disabled = solid; $("useMid").disabled = solid;
  $("tmPos").disabled = $("tmScale").disabled = $("tmGap").disabled = !S.tmOn;
}
for (const id of ids) {
  const el = $(id);
  el.addEventListener("input", () => {
    S[id] = el.type === "checkbox" ? el.checked : el.type === "range" || id === "ss" ? +el.value : el.value;
    const o = document.querySelector(`output[data-for="${id}"]`); if (o) o.textContent = showVal(id);
    syncLogoUI(); scheduleLogo(id === "text" || id === "upper");
  });
}
document.querySelectorAll("#tabLogo input[type=range]").forEach(r => r.addEventListener("dblclick", () => { if (r.id in LDEF) { S[r.id] = LDEF[r.id]; syncLogoUI(); scheduleLogo(); } }));
$("viewSel").addEventListener("input", e => { S.view = e.target.value; scheduleLogo(); });
$("zoomSel").addEventListener("input", e => { S.zoom = +e.target.value; scheduleLogo(); });
$("flicker").addEventListener("input", e => { S.flicker = e.target.checked; scheduleLogo(); });
$("resetKern").addEventListener("click", () => { S.kerns = {}; scheduleLogo(true); });
$("resetAll").addEventListener("click", () => { const t = S.text; S = Object.assign({}, LDEF, { text: t, kerns: {} }); syncLogoUI(); scheduleLogo(true); });
document.querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => { for (const k of b.dataset.reset.split(",")) S[k] = LDEF[k]; syncLogoUI(); scheduleLogo(true); }));
$("fontFile").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const face = new FontFace("UserFont" + (++fontSerial), await f.arrayBuffer());
    await face.load(); document.fonts.add(face);
    const buf = await f.arrayBuffer();
    fontFamily = face.family; fontLabel = f.name; G.logo.clearCache(); syncLogoUI(); scheduleLogo(true);
    idb.put("font", { name: f.name, buf }).catch(() => {});
  } catch (err) { $("fontName").textContent = t("Couldn't read {file}. Use a TTF, OTF, WOFF or WOFF2 file.", { file: f.name }); }
});
$("fontReset").addEventListener("click", () => { fontFamily = "Michroma"; fontLabel = null; idb.del("font").catch(() => {}); G.logo.clearCache(); syncLogoUI(); scheduleLogo(true); });
async function restoreFont() {
  try {
    const v = await idb.get("font"); if (!v || !v.buf) return;
    const face = new FontFace("UserFont" + (++fontSerial), v.buf); await face.load(); document.fonts.add(face);
    fontFamily = face.family; fontLabel = v.name; G.logo.clearCache(); syncLogoUI(); scheduleLogo(true);
  } catch (e) {}
}
$("refFile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; const img = new Image(); img.onload = () => { refImg = img; scheduleLogo(); }; img.src = URL.createObjectURL(f); });
$("refClear").addEventListener("click", () => { refImg = null; $("refFile").value = ""; scheduleLogo(); });

/* presets */
const STYLE_KEYS = ["fillMode", "lTop", "lMid", "lBot", "useMid", "bevelOn", "bevelW", "bevelS", "lightA", "lightE", "outOn", "outL", "outW", "glowOn", "glowL", "glowR", "glowA"];
const PRESETS = [
  { name: "Standard", v: {} },
  { name: "Bevel, no gradient", v: { fillMode: "solid", lTop: 100 } },
  { name: "Flat", v: { fillMode: "solid", bevelOn: false } },
  { name: "Chrome", v: { useMid: true, lTop: 100, lMid: 50, lBot: 92, bevelW: 1.6, bevelS: 0.9, lightE: 38 } },
  { name: "Embossed", v: { fillMode: "solid", lTop: 82, bevelW: 2.2, bevelS: 1.1, lightA: 135, lightE: 30 } },
  { name: "Soft glow", v: { fillMode: "solid", bevelS: 0.4, glowOn: true, glowL: 70, glowR: 3, glowA: 0.55 } },
  { name: "Outlined", v: { fillMode: "solid", lTop: 55, bevelOn: false, outOn: true, outL: 100, outW: 1 } }
];
const styleOf = src => Object.fromEntries(STYLE_KEYS.map(k => [k, src[k]]));
const fullStyle = v => Object.assign(styleOf(LDEF), v);
let myPresets = store.get("gcas-logo-presets", []);
const sameStyle = v => { const fs = fullStyle(v); return STYLE_KEYS.every(k => fs[k] === S[k]); };
function chip(name, v) { const b = document.createElement("button"); b.type = "button"; b.className = "pchip"; b.textContent = t(name); b.setAttribute("aria-pressed", sameStyle(v)); b.addEventListener("click", () => { Object.assign(S, fullStyle(v)); syncLogoUI(); scheduleLogo(); }); return b; }
function buildPresets() {
  $("presets").replaceChildren(...PRESETS.map(p => chip(p.name, p.v)));
  $("myPresets").replaceChildren(...myPresets.map((p, i) => {
    const w = document.createElement("span"); w.className = "mine";
    const d = document.createElement("button"); d.type = "button"; d.className = "pchip del"; d.textContent = "×"; d.setAttribute("aria-label", t("Delete preset {name}", { name: p.name }));
    d.addEventListener("click", () => { myPresets.splice(i, 1); store.set("gcas-logo-presets", myPresets); buildPresets(); });
    w.append(chip(p.name, p.v), d); return w;
  }));
}
$("presetSave").addEventListener("click", () => {
  const name = $("presetName").value.trim() || t("My style {n}", { n: myPresets.length + 1 });
  const i = myPresets.findIndex(p => p.name === name), entry = { name, v: styleOf(S) };
  if (i >= 0) myPresets[i] = entry; else myPresets.push(entry);
  $("presetName").value = ""; store.set("gcas-logo-presets", myPresets); buildPresets();
});

let logoPending = false, pairsDirty = true;
function scheduleLogo(pairs) { if (pairs) pairsDirty = true; if (logoPending) return; logoPending = true; requestAnimationFrame(() => { logoPending = false; renderLogo(); }); }
function renderLogo() {
  logoRes = G.logo.render(S, fontFamily);
  store.set("gcas-logo-v1", S);
  if (pairsDirty) buildPairs(logoRes.pairs);
  buildPresets();
  const msgs = [];
  if (logoRes.empty) msgs.push(["warn", t("Type some text to preview the logotype.")]);
  if (logoRes.clipped) msgs.push(["warn", t("Pixels touch the edge of the 352 × 40 frame, so the glow or outline may be cut off. Lower the cap height or add margin.")]);
  if (logoRes.shrunk) msgs.push(["note", t("Text was shrunk to fit the width.")]);
  if (!msgs.length) msgs.push(["okmsg", t("Fits the frame with room to spare.")]);
  $("status").replaceChildren(...msgs.map(([c, t]) => { const p = document.createElement("div"); p.className = c; p.textContent = t; return p; }));
  drawLogoPreviews();
  if (!$("tabAnim").hidden) scheduleAnim();
  if (!extSrc && $("useLogo").checked) { sceneDirty = true; requestRender(); }
}
function flickerFilter(src) {
  const W = 352, H = 40, d = new Uint8ClampedArray(src.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ym = Math.max(0, y - 1), yp = Math.min(H - 1, y + 1);
    for (let c = 0; c < 4; c++) d[(y * W + x) * 4 + c] = (src[(ym * W + x) * 4 + c] + 2 * src[(y * W + x) * 4 + c] + src[(yp * W + x) * 4 + c]) / 4;
  }
  return d;
}
const tmp = document.createElement("canvas"); tmp.width = 352; tmp.height = 40; const tctx = tmp.getContext("2d");
function drawLogoPreviews() {
  if (!logoRes) return;
  const col = currentCol || colNow().col;
  const wii = new ImageData(352, 40); G.logo.composite(logoRes.i8, col, wii.data);
  const gray = new ImageData(352, 40); for (let p = 0; p < logoRes.i8.length; p++) { const o = p * 4; gray.data[o] = gray.data[o + 1] = gray.data[o + 2] = logoRes.i8[p]; gray.data[o + 3] = 255; }
  let shown = S.view === "i8" ? gray : wii;
  if (S.flicker) shown = new ImageData(flickerFilter(shown.data), 352, 40);
  tctx.putImageData(shown, 0, 0);
  const z = S.zoom, zc = $("zoomCv"); zc.width = 352 * z; zc.height = 40 * z;
  const c = zc.getContext("2d"); c.imageSmoothingEnabled = false; c.drawImage(tmp, 0, 0, 352 * z, 40 * z);
  if (refImg && S.refA > 0) { c.globalAlpha = S.refA; c.drawImage(refImg, 0, 0, 352 * z, 40 * z); c.globalAlpha = 1; }
  const a = $("act1"); a.width = 352; a.height = 40;
  a.getContext("2d").putImageData(S.flicker ? new ImageData(flickerFilter(wii.data), 352, 40) : wii, 0, 0);
}
function buildPairs(list) {
  pairsDirty = false;
  $("pairs").replaceChildren(...list.map(p => {
    const row = document.createElement("div"); row.className = "field";
    const lab = document.createElement("span"); lab.className = "pair"; lab.textContent = p;
    const r = document.createElement("input"); r.type = "range"; r.min = "-0.3"; r.max = "0.3"; r.step = "0.005"; r.value = S.kerns[p] || 0;
    r.id = "kern-" + [...p].map(ch => ch.charCodeAt(0)).join("-"); r.setAttribute("aria-label", t("Kerning for {pair}", { pair: p }));
    const out = document.createElement("output"); out.textContent = (+r.value).toFixed(3);
    r.addEventListener("input", () => { const v = +r.value; if (v) S.kerns[p] = v; else delete S.kerns[p]; out.textContent = v.toFixed(3); scheduleLogo(); });
    r.addEventListener("dblclick", () => { r.value = 0; delete S.kerns[p]; out.textContent = "0.000"; scheduleLogo(); });
    row.append(lab, r, out); return row;
  }));
  if (!list.length) { const p = document.createElement("p"); p.className = "note"; p.textContent = t("Pairs appear here once the text has two adjacent letters."); $("pairs").append(p); }
}

/* ---------------- export ---------------- */
async function logoPngBlob() {
  const c = document.createElement("canvas"); c.width = 352; c.height = 40;
  const x = c.getContext("2d"), img = x.createImageData(352, 40);
  for (let p = 0; p < logoRes.i8.length; p++) { const o = p * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = logoRes.i8[p]; img.data[o + 3] = 255; }
  x.putImageData(img, 0, 0);
  return await new Promise(res => c.toBlob(res, "image/png"));
}
function showImgFallback(imgEl, blob) { const fr = new FileReader(); fr.onload = () => (imgEl.src = fr.result); fr.readAsDataURL(blob); }
$("saveLogo").addEventListener("click", async () => {
  if (!logoRes) return;
  const blob = await logoPngBlob();
  offerFile("logo.png", blob, $("logoFallback"), $("logoMsg"), () => showImgFallback($("logoImg"), blob));
});
$("saveBundle").addEventListener("click", async () => {
  const files = [{ name: "apps/gc-anim-wii/gc-anim.ini", data: new TextEncoder().encode(G.config.serialize(M)) }];
  let blob = null;
  if ($("bundleLogo").checked && logoRes) { blob = await logoPngBlob(); files.push({ name: "apps/gc-anim-wii/logo.png", data: new Uint8Array(await blob.arrayBuffer()) }); }
  const zipData = G.zip.makeZip(files);
  const img = M.image.trim().toLowerCase();
  await offerFile("gc-anim-wii.zip", new Blob([zipData], { type: "application/zip" }), $("bundleFallback"), $("bundleMsg"), () => { if (blob) showImgFallback($("bundleImg"), blob); });
  if (blob && img && img !== "logo.png") $("bundleMsg").textContent += " " + t("The ini loads {file}, so the program will not use the logo.png in the zip.", { file: M.image.trim() });
});


/* =============================================================== */
/*  IPL dump and rendered preview                                   */
/* =============================================================== */
const idb = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open("gc-anim-studio", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction("files", mode), st = t.objectStore("files"), rq = fn(st); t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); }); };
  return { get: k => tx("readonly", s => s.get(k)), put: (k, v) => tx("readwrite", s => s.put(v, k)), del: k => tx("readwrite", s => s.delete(k)) };
})();
let IPL = null, SCENE = null, sceneDirty = true, wide = store.get("gcas-wide", false);
let frameNo = 0, timeline = null, gxCtx = null;
/* the intro being previewed: the IPL's boot animation (scene.js) or the promo intro (promo.js) */
const modeNow = () => (M.intro === "promo" ? "promo" : "ipl");
const REN = mode => (mode === "promo" ? G.promo : G.scene);
let shownMode = null;
const timelines = {}, frameBy = {};
function timelineFor(mode) {
  if (!timelines[mode]) timelines[mode] = mode === "promo" ? { frames: G.promo.FRAMES, marks: G.promo.MARKS, last: G.promo.MARKS.find(m => m.label === "Final logo").n } : computeTimeline();
  return timelines[mode];
}

function computeTimeline() {
  const s = G.intro.init(); let n = 0, last = 0, drop = 0, tile15 = 0, jump = 0, impact = 0;
  while (!s.finished && n < 2000) {
    G.intro.update(s); if (s.finished) break; n++;
    if (s.fade === 0) last = n;
    if (!drop && s.state === 0 && s.h === 0) drop = n;
    if (!tile15 && s.nlaid >= 16) tile15 = n;
    if (!jump && s.state === 2) jump = n;
    if (!impact && s.state === 3 && s.y4c === 0) impact = n;
  }
  const marks = [{ n: drop, label: "Drop lands" }, { n: 45, label: "Tile {n}", vars: { n: 1 } }, { n: 75, label: "Tile {n}", vars: { n: 4 } }, { n: 128, label: "Tile {n}", vars: { n: 8 } },
    { n: 178, label: "Tile {n}", vars: { n: 12 } }, { n: tile15, label: "Tile {n}", vars: { n: 15 } }, { n: jump, label: "Jump" }, { n: impact, label: "Impact" }, { n: last, label: "Final logo" }];
  return { frames: n, last, marks: marks.filter(m => m.n > 0) };
}
function showIpl() {
  const has = !!IPL;
  $("tabBtnLogo").disabled = !has; $("helpBtn").disabled = !has;
  if (!has && !$("tabLogo").hidden) showTab("tabBtnAnim");
  $("iplEmpty").hidden = has; $("animGrid").hidden = !has; $("iplView").hidden = !has; $("previewTools").hidden = !has;
  if (!has) return;
  const mode = modeNow();
  if (shownMode && shownMode !== mode) { frameBy[shownMode] = frameNo; frameNo = frameBy[mode] || 0; }
  shownMode = mode; timeline = timelineFor(mode);
  $("previewMode").textContent = mode === "promo" ? "- Promo" : "- IPL";
  const fr = $("frame"); fr.max = timeline.frames;
  if (!frameNo || frameNo > timeline.frames) frameNo = mode === "promo" ? timeline.last : (timeline.marks.find(m => m.label === "Tile {n}" && m.vars.n === 15) || { n: timeline.last }).n;
  fr.value = frameNo;
  $("moments").replaceChildren(...timeline.marks.map(m => { const b = document.createElement("button"); b.type = "button"; b.className = "pchip"; b.textContent = t(m.label, m.vars); b.addEventListener("click", () => setFrame(m.n)); b.dataset.n = m.n; return b; }));
  $("iplInfo").textContent = `${IPL.name} · ${IPL.version || t("unknown version")} · ${IPL.scrambled ? t("scrambled dump") : t("descrambled dump")}`;
  syncAspect(); sceneDirty = true; requestRender();
}
function syncAspect() {
  $("ar43").setAttribute("aria-pressed", !wide); $("ar169").setAttribute("aria-pressed", wide);
  $("screen").classList.toggle("wide", wide);
}
$("ar43").addEventListener("click", () => { wide = false; store.set("gcas-wide", wide); syncAspect(); requestRender(); });
$("ar169").addEventListener("click", () => { wide = true; store.set("gcas-wide", wide); syncAspect(); requestRender(); });
function setFrame(n) { frameNo = Math.max(1, Math.min(timeline ? timeline.frames : 331, n)); $("frame").value = frameNo; store.set("gcas-frame", frameNo); requestRender(); }
$("frame").addEventListener("input", e => setFrame(+e.target.value));
$("fPrev").addEventListener("click", () => setFrame(frameNo - 1));
$("fNext").addEventListener("click", () => setFrame(frameNo + 1));
$("useLogo").addEventListener("input", () => { sceneDirty = true; requestRender(); });
function loadIpl(buf, name, persist) {
  let res;
  try { res = G.ipl.load(buf); } catch (e) { res = { error: t("This file could not be read: {msg}", { msg: e.message }) }; }
  if (res.error) { $("iplErr").textContent = res.error; $("iplErr").hidden = false; IPL = null; showIpl(); return false; }
  $("iplErr").hidden = true;
  IPL = Object.assign(res, { name });
  if (persist) idb.put("ipl", { name, buf }).catch(() => {});
  if (persist && !store.get("gcas-tour-v1", false)) tourPending = true;
  if (!persist && wantedTab === "tabBtnLogo") { showIpl(); showTab("tabBtnLogo"); return true; }   /* back where the last visit ended */
  showIpl(); return true;
}
/* drag and drop onto the drop zone (or anywhere while it is shown) */
const dz = $("iplEmpty");
const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
window.addEventListener("dragover", e => { if (!hasFiles(e) || dz.hidden) return; e.preventDefault(); dz.classList.add("over"); });
window.addEventListener("dragleave", e => { if (e.target === document.documentElement || !e.relatedTarget) dz.classList.remove("over"); });
window.addEventListener("drop", async e => {
  if (!hasFiles(e) || dz.hidden) return;
  e.preventDefault(); dz.classList.remove("over");
  const f = e.dataTransfer.files[0]; if (f) loadIpl(await f.arrayBuffer(), f.name, true);
});
$("iplFile").addEventListener("change", async e => {
  const f = e.target.files[0]; if (!f) return; e.target.value = "";
  loadIpl(await f.arrayBuffer(), f.name, true);
});
$("iplForget").addEventListener("click", () => { idb.del("ipl").catch(() => {}); IPL = null; SCENE = null; showIpl(); });

let renderPending = false;
function requestRender() {
  if (!IPL || renderPending) return;
  renderPending = true; $("busy").hidden = false;
  setTimeout(() => requestAnimationFrame(() => { renderPending = false; renderPreview(); }), 0);
}
function logoSource() {
  if (!$("useLogo").checked) return null;
  if (extSrc) return extSrc;
  return logoRes ? { rgba: logoRes.rgba, w: 352, h: 40 } : null;
}
function renderPreview() {
  if (!IPL) return;
  const t0 = performance.now();
  try {
    if (sceneDirty || !SCENE) {
      const cfg = effCfg();
      SCENE = REN(shownMode).build(IPL.assets, cfg, logoSource()); sceneDirty = false;
    }
    if (!gxCtx) gxCtx = G.gx.create(G.scene.W, G.scene.H);
    const { rgba } = REN(shownMode).render(SCENE, frameNo, wide, gxCtx);
    $("frameCv").getContext("2d").putImageData(new ImageData(rgba, G.scene.W, G.scene.H), 0, 0);
    $("frameOut").textContent = `${frameNo} / ${timeline.frames}`;
    document.querySelectorAll("#moments .pchip").forEach(b => b.setAttribute("aria-pressed", +b.dataset.n === frameNo));
    $("renderTime").textContent = t("Rendered in {ms} ms", { ms: Math.round(performance.now() - t0) });
    const w = [...G.gx.warned];
    $("gxWarn").replaceChildren(...w.map(msg => { const p = document.createElement("div"); p.className = "note"; p.textContent = t("Renderer: {msg}", { msg }); return p; }));
  } catch (e) {
    $("renderTime").textContent = t("The frame could not be rendered: {msg}", { msg: e.message });
    if (typeof console !== "undefined") console.error(e);
  }
  $("busy").hidden = true;
  if (tourPending) { tourPending = false; setTimeout(openTour, 150); }
}

/* ---------------- MP4 export: render every frame and feed it to the browser's video encoder ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pickCodec(width, height) {
  if (typeof VideoEncoder === "undefined") return null;
  const tries = [
    { kind: "avc", name: "H.264", cfg: { codec: "avc1.4d401f", avc: { format: "avc" } } },
    { kind: "avc", name: "H.264", cfg: { codec: "avc1.42e01f", avc: { format: "avc" } } },
    { kind: "vp9", name: "VP9", cfg: { codec: "vp09.00.31.08" } }
  ];
  for (const c of tries) {
    const cfg = Object.assign({ width, height, bitrate: 4e6, framerate: 60, latencyMode: "quality" }, c.cfg);
    try { const r = await VideoEncoder.isConfigSupported(cfg); if (r.supported) return Object.assign({}, c, { cfg }); } catch (e) {}
  }
  return null;
}
let mp4Cancel = false, mp4Busy = false, mp4Url = null;
async function exportMp4() {
  if (!IPL || mp4Busy) return;
  const msg = $("mp4Msg"), WIDE = wide, width = WIDE ? 854 : 640, height = 480, fps = 60;
  $("mp4Fallback").hidden = true; msg.textContent = "";
  const codec = await pickCodec(width, height);
  if (!codec) { msg.textContent = typeof VideoEncoder === "undefined" ? t("MP4 export needs a browser with WebCodecs (recent Chrome, Edge or Safari).") : t("This browser can't encode H.264 or VP9 video."); return; }
  mp4Busy = true; mp4Cancel = false; $("mp4Go").hidden = true; $("mp4Stop").hidden = false; $("mp4Box").hidden = false;
  const total = timeline.frames, setProg = v => { const pct = Math.round(v * 100 / total); $("mp4Fill").style.width = pct + "%"; $("mp4Box").setAttribute("aria-valuenow", pct); };
  setProg(0);
  let encoder = null, failure = null;
  try {
    /* a private copy of the scene and renderer: the preview stays usable meanwhile */
    const cfg = effCfg();
    const Rn = REN(shownMode), scene = Rn.build(IPL.assets, cfg, logoSource()), gx = G.gx.create(G.scene.W, G.scene.H);
    const src = document.createElement("canvas"); src.width = G.scene.W; src.height = G.scene.H;
    const out = document.createElement("canvas"); out.width = width; out.height = height;
    const sctx = src.getContext("2d"), octx = out.getContext("2d");
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = "high";
    const mux = G.mp4.createMuxer({ codec: codec.kind, width, height, fps });
    encoder = new VideoEncoder({ output: (chunk, meta) => mux.add(chunk, meta), error: e => { failure = e; } });
    encoder.configure(codec.cfg);
    for (let n = 1; n <= total; n++) {
      if (mp4Cancel || failure) break;
      const { rgba } = Rn.render(scene, n, WIDE, gx);
      sctx.putImageData(new ImageData(rgba, G.scene.W, G.scene.H), 0, 0);
      octx.drawImage(src, 0, 0, width, height);
      const vf = new VideoFrame(out, { timestamp: Math.round((n - 1) * 1e6 / fps), duration: Math.round(1e6 / fps) });
      encoder.encode(vf, { keyFrame: (n - 1) % fps === 0 }); vf.close();
      setProg(n); msg.textContent = t("Encoding frame {n} of {total}…", { n, total });
      await sleep(0);
      while (encoder.encodeQueueSize > 4 && !failure) await sleep(5);
    }
    if (failure) throw failure;
    if (mp4Cancel) { encoder.close(); encoder = null; msg.textContent = t("Export cancelled."); return; }
    await encoder.flush(); encoder.close(); encoder = null;
    if (failure) throw failure;
    const blob = mux.finish();
    const name = `gc-anim-wii-${shownMode === "promo" ? "promo-" : ""}${WIDE ? "16x9" : "4x3"}.mp4`;
    msg.textContent = t("Video ready: {size} MB, {codec}.", { size: (blob.size / 1048576).toFixed(2), codec: codec.name });
    const done = msg.textContent;
    await offerFile(name, blob, $("mp4Fallback"), msg, () => {
      if (mp4Url) URL.revokeObjectURL(mp4Url);
      mp4Url = URL.createObjectURL(blob); $("mp4Video").src = mp4Url;
    });
    msg.textContent = msg.textContent ? done + " " + msg.textContent : done;
  } catch (e) {
    msg.textContent = t("The video could not be made: {msg}", { msg: (e && e.message) || String(e) });
    if (encoder) try { encoder.close(); } catch (e2) {}
  } finally {
    mp4Busy = false; $("mp4Go").hidden = false; $("mp4Stop").hidden = true; $("mp4Box").hidden = true;
  }
}
$("mp4Btn").addEventListener("click", () => { if (mp4Busy) mp4Cancel = true; else exportMp4(); });
if (typeof VideoEncoder === "undefined") { $("mp4Btn").disabled = true; $("mp4Btn").title = t("MP4 export needs a browser with WebCodecs (recent Chrome, Edge or Safari)."); }

/* ---------------- tutorial: 3 slides, shown once after the first IPL upload (and from the ? button) ---------------- */
let tourPending = false, tourIdx = 0, tourTimer = null, tourPhase = 0, tourJob = 0, tourPlay = null;
const TOUR_TICK = 950;      /* slide 1: the drawn scrubber steps from stage to stage */
const TOUR_STAGES = { ipl: ["Drop lands", ["Tile {n}", { n: 4 }], ["Tile {n}", { n: 15 }], "Jump", "Final logo"], promo: ["Light streaks", "Glass cube", "Slam", "Final logo", "Fade-out"] };
const tourImgs = { frame: "", logo: "", stages: [], presets: [], ipl: "", promo: "" };
const TOUR_PRESETS = () => [
  { name: "Default (indigo)", sw: [[95, 80, 190]], set: m => {} },
  HW_PRESETS.find(p => p.name === "Spice Orange"),
  HW_PRESETS.find(p => p.name === "Vertical Stripes (Hanshin Tigers)"),
  { name: "Rainbow", sw: ANIM_PRESETS.find(p => p.rainbow).sw, set: m => { m.tiles = { mode: "rainbow", list: m.tiles.list }; m.tiles_mode = "cycle"; m.cube = { mode: "tiles", rgb: m.cube.rgb }; m.trail = 4; } }
].filter(Boolean);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const waitMsg = () => `<div class="tart-empty">${esc(IPL ? t("Rendering…") : t("Load your IPL to see the previews."))}</div>`;
const img = (src, cls) => (src ? `<img alt="" src="${src}"${cls ? ` class="${cls}"` : ""}>` : waitMsg());
function tourSlides() {
  const P = TOUR_PRESETS();
  return [
    { title: t("Two editors"), text: [t("Animation edits gc-anim.ini and previews the boot animation, rendered from your own IPL, frame by frame."), t("Logotype designs the image that replaces “GAMECUBE”. Switch between the two with the tabs at the top.")],
      art: () => `<div class="mock"><div class="mock-bar"><span class="mpill" data-ph="0">${esc(t("Animation"))}</span><span class="mpill" data-ph="1">${esc(t("Logotype"))}</span></div>
        <div class="mock-body"><div class="tstate" data-ph="0"><div class="mprev"><div class="mframe">${img(tourImgs.frame)}${tourImgs.stages.map((src, i) => (src ? `<img alt="" class="msf" data-sf="${i}" src="${src}">` : "")).join("")}</div>
          <div class="mscrub"><span class="mtrack"></span><span class="mthumb" id="tourThumb"></span></div>
          <div class="mchips">${TOUR_STAGES[shownMode || "ipl"].map((st, i) => `<span data-st="${i}">${esc(Array.isArray(st) ? t(st[0], st[1]) : t(st))}</span>`).join("")}</div></div>
          <div class="mside"><i></i><i></i><b></b><i></i><i></i><i></i></div></div>
        <div class="tstate" data-ph="1"><div class="mframe">${img(tourImgs.logo, "mlogo")}</div><div class="mside"><i></i><b></b><i></i><i></i><i></i></div></div></div></div>`, phases: [TOUR_TICK * 5 + 500, 2600] },
    { title: t("Colors"), text: [t("Start from a quick preset: the original indigo, a GameCube hardware color or a multicolor pattern. Then fine-tune the theme color, the small cube, the tiles and the logo."), t("“Random at each boot” draws a new color scheme every time the Wii starts.")],
      art: () => P.map((p, i) => `<div class="tstate" data-ph="${i}">${img(tourImgs.presets[i])}</div>`).join("") +
        `<div class="tchips">${P.map((p, i) => `<span data-ph="${i}">${(p.sw || []).map(c => `<i style="background:rgb(${c})"></i>`).join("")}${esc(t(p.name))}</span>`).join("")}</div>`, phases: P.map(() => 2200), chips: true },
    { title: t("General settings"), text: [`<ul><li>${esc(t("Intro: the IPL's boot animation, or the promo videos' intro."))}</li><li>${esc(t("Delay: a black screen first, for slow HDMI screens and mods."))}</li><li>${esc(t("SMB easter egg: World 1-1 or the whole game, with your own smb.nes."))}</li></ul>`,
        t("When you're done, save gc-anim-wii.zip and unzip it at the root of your SD card or USB drive.")],
      art: () => `<div class="t3">
        <figure>${img(tourImgs.ipl)}<figcaption>${esc(t("Boot animation (IPL)"))}</figcaption></figure>
        <figure>${img(tourImgs.promo)}<figcaption>${esc(t("Promo videos' intro"))}</figcaption></figure>
        <div class="t3card"><b>${esc(t("Delay"))}</b><div class="t3delay"><span class="blk">${esc(t("Black screen"))}</span><span class="go">${esc(t("Animation"))} ▶</span></div><small>0 – 10000 ms</small></div>
        <div class="t3card"><b>${esc(t("SMB easter egg"))}</b><div class="t3smb">
          <div><span class="lv one"><i class="on"></i></span><small>${esc(t("World 1-1 only"))}</small></div>
          <div><span class="lv all">${"<i></i>".repeat(32)}</span><small>${esc(t("The whole game"))}</small></div></div></div>
      </div>`, phases: [0], tall: true }
  ];
}
function rgbaUrl(rgba, w, h, bg) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h; tmp.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, w, h); }
  x.drawImage(tmp, 0, 0);
  return c.toDataURL("image/png");
}
function drawTour() {
  const slides = tourSlides(), sl = slides[tourIdx];
  $("tourStep").textContent = t("{n} of {total}", { n: tourIdx + 1, total: slides.length });
  $("tourTitle").textContent = sl.title;
  $("tourText").innerHTML = sl.text.map(x => (x.startsWith("<ul>") ? x : `<p>${esc(x)}</p>`)).join("");
  const art = $("tourArt"); art.innerHTML = sl.art(); art.classList.toggle("withchips", !!sl.chips); art.classList.toggle("tall", !!sl.tall);
  $("tourDots").replaceChildren(...slides.map((_, i) => { const b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", t("{n} of {total}", { n: i + 1, total: slides.length })); if (i === tourIdx) b.setAttribute("aria-current", "step"); b.addEventListener("click", () => { tourIdx = i; tourPhase = 0; drawTour(); schedulePhase(); }); return b; }));
  $("tourBack").hidden = tourIdx === 0;
  $("tourSkip").hidden = tourIdx === slides.length - 1;
  $("tourNext").textContent = tourIdx === slides.length - 1 ? t("Done") : t("Next");
  tourPhase %= sl.phases.length; showPhase(); drawScrub();
}
function showPhase() { $("tourArt").querySelectorAll("[data-ph]").forEach(el => el.classList.toggle("on", +el.dataset.ph === tourPhase)); }
/* each phase of a slide has its own duration (slide 1: the animation plays, then the Logotype tab) */
function schedulePhase() {
  clearTimeout(tourTimer);
  const sl = tourSlides()[tourIdx], d = sl.phases[tourPhase];
  if (!d || sl.phases.length < 2) return;
  tourTimer = setTimeout(() => { tourPhase = (tourPhase + 1) % sl.phases.length; showPhase(); if (tourPhase === 0 && tourIdx === 0) { tourPlay.i = 0; drawScrub(); } schedulePhase(); }, d);
}
/* slide 1: the drawn scrubber, its thumb gliding from stage button to stage button */
function drawScrub() {
  const th = document.getElementById("tourThumb"); if (!th || !tourPlay) return;
  const n = TOUR_STAGES[shownMode || "ipl"].length, i = tourPlay.i % n;
  th.style.left = `${((i + 0.5) / n) * 100}%`;
  $("tourArt").querySelectorAll("[data-st]").forEach(el => el.classList.toggle("on", +el.dataset.st === i));
  $("tourArt").querySelectorAll("[data-sf]").forEach(el => el.classList.toggle("on", +el.dataset.sf === i));
}
function tourStep(d) {
  const n = tourSlides().length;
  if (tourIdx + d >= n) { $("tour").close(); return; }
  tourIdx = Math.max(0, tourIdx + d); tourPhase = 0; drawTour(); schedulePhase(); $("tourNext").focus();
}
/* live pictures from the user's own IPL (nothing from Nintendo is stored in the page) */
async function tourRenders(job) {
  if (!IPL) return;
  const gx = G.gx.create(G.scene.W, G.scene.H), logo = logoSource(), mode = shownMode || "ipl", tl = timelineFor("ipl");
  const tile15 = (tl.marks.find(m => m.label === "Tile {n}" && m.vars && m.vars.n === 15) || { n: tl.last }).n;
  const cfgOf = m => { const cfg = G.config.parseIni(G.config.serialize(m)).cfg; if (cfg.color_random) G.config.randomize(cfg, randSeed); return cfg; };
  const base = () => Object.assign(JSON.parse(JSON.stringify(M)), { intro: "ipl" });
  const shot = (Rn, m, n) => rgbaUrl(Rn.render(Rn.build(IPL.assets, cfgOf(m), logo), n, false, gx).rgba, G.scene.W, G.scene.H);
  /* slide 3: both intros in the same color (the theme color, or the original indigo), so the light streaks are the difference */
  const same = () => { const m = base(); m.color = { on: true, random: false, rgb: M.color.on && !M.color.random ? M.color.rgb.slice() : [95, 80, 190] }; m.logo.on = false; m.glass.on = false; return m; };
  /* slide 1: the frame of each stage, in the intro being previewed */
  const Rs = REN(mode), sm = Object.assign(base(), { intro: mode });
  const stageN = TOUR_STAGES[mode].map(st => { const lab = Array.isArray(st) ? st[0] : st, v = Array.isArray(st) ? st[1] : null;
    const mk = timelineFor(mode).marks.find(m => m.label === lab && (!v || (m.vars && m.vars.n === v.n))); return mk ? mk.n : 1; });
  let stageScene = null;
  const queue = [
    ...stageN.map((n, i) => ({ slide: 0, f: () => { if (!stageScene) stageScene = Rs.build(IPL.assets, cfgOf(sm), logo); tourImgs.stages[i] = rgbaUrl(Rs.render(stageScene, n, false, gx).rgba, G.scene.W, G.scene.H); } })),
    ...TOUR_PRESETS().map((p, i) => ({ slide: 1, f: () => { const m = base(); resetColors(m); m.color.random = false; p.set(m); tourImgs.presets[i] = shot(G.scene, m, tile15); } })),
    { slide: 2, f: () => (tourImgs.ipl = shot(G.scene, same(), tl.last)) },
    { slide: 2, f: () => (tourImgs.promo = shot(G.promo, Object.assign(same(), { intro: "promo" }), 31)) }   /* the logo appearing among the light streaks */
  ];
  while (queue.length) {
    await sleep(20); if (job !== tourJob || !$("tour").open) return;
    let k = queue.findIndex(q => q.slide === tourIdx); if (k < 0) k = 0;
    const { slide, f } = queue.splice(k, 1)[0];
    try { f(); } catch (e) { if (typeof console !== "undefined") console.error(e); }
    if ($("tour").open && slide === tourIdx) { const ph = tourPhase; drawTour(); tourPhase = ph; showPhase(); drawScrub(); }
  }
}
function openTour() {
  const d = $("tour"); if (d.open) return;
  tourIdx = 0; tourPhase = 0; Object.assign(tourImgs, { frame: "", stages: [], presets: [], ipl: "", promo: "" });
  tourImgs.logo = logoRes && !logoRes.empty ? rgbaUrl(logoRes.rgba, 352, 40, "#000") : "";
  tourImgs.frame = IPL ? $("frameCv").toDataURL("image/png") : "";
  try { d.showModal(); } catch (e) { d.setAttribute("open", ""); }
  drawTour(); schedulePhase(); $("tourNext").focus();
  clearInterval(tourPlay && tourPlay.timer);
  tourPlay = { i: 0, timer: setInterval(() => { tourPlay.i++; drawScrub(); }, TOUR_TICK) };
  tourRenders(++tourJob);
}
$("tour").addEventListener("close", () => { clearTimeout(tourTimer); clearInterval(tourPlay && tourPlay.timer); tourJob++; Object.assign(tourImgs, { stages: [], presets: [] }); store.set("gcas-tour-v1", true); });
$("tour").addEventListener("keydown", e => { if (e.key === "ArrowRight") { e.preventDefault(); tourStep(1); } else if (e.key === "ArrowLeft") { e.preventDefault(); tourStep(-1); } });
$("tour").addEventListener("click", e => { if (e.target === $("tour")) $("tour").close(); });
$("tourNext").addEventListener("click", () => tourStep(1));
$("tourBack").addEventListener("click", () => tourStep(-1));
$("tourSkip").addEventListener("click", () => $("tour").close());
$("helpBtn").addEventListener("click", openTour);
(async () => { try { const v = await idb.get("ipl"); if (v && v.buf) loadIpl(v.buf, v.name, false); } catch (e) {} })();


/* =============================================================== */
/*  Language                                                        */
/* =============================================================== */
const I = G.i18n;
const CJK_FONT = { ja: "Noto+Sans+JP", "zh-CN": "Noto+Sans+SC", ko: "Noto+Sans+KR" };
function loadCjkFont(code) {
  const fam = CJK_FONT[code]; if (!fam || document.getElementById("font-" + code)) return;
  const l = document.createElement("link"); l.rel = "stylesheet"; l.id = "font-" + code;
  l.href = `https://fonts.googleapis.com/css2?family=${fam}:wght@400;500;700&display=swap`; document.head.append(l);
}
function buildLangMenu() {
  $("langName").textContent = I.LANGS.find(l => l.code === I.lang).name;
  $("langMenu").setAttribute("aria-label", t("Language"));
  $("langMenu").replaceChildren(...I.LANGS.map(l => {
    const li = document.createElement("li"); li.setAttribute("role", "option"); li.tabIndex = 0; li.lang = l.code;
    li.setAttribute("aria-selected", l.code === I.lang);
    const name = document.createElement("span"); name.textContent = l.name;
    const code = document.createElement("small"); code.textContent = l.code;
    li.append(name, code);
    const pick = () => { closeLangMenu(); applyLang(l.code, true); $("langBtn").focus(); };
    li.addEventListener("click", pick);
    li.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); (li.nextElementSibling || li.parentElement.firstElementChild).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (li.previousElementSibling || li.parentElement.lastElementChild).focus(); }
      else if (e.key === "Escape") { closeLangMenu(); $("langBtn").focus(); }
    });
    return li;
  }));
}
function openLangMenu() { $("langMenu").hidden = false; $("langBtn").setAttribute("aria-expanded", "true"); const s = $("langMenu").querySelector('[aria-selected="true"]'); if (s) s.focus(); }
function closeLangMenu() { $("langMenu").hidden = true; $("langBtn").setAttribute("aria-expanded", "false"); }
$("langBtn").addEventListener("click", () => ($("langMenu").hidden ? openLangMenu() : closeLangMenu()));
document.addEventListener("click", e => { if (!e.target.closest(".langwrap")) closeLangMenu(); });
let langReady = false;
function applyLang(code, user) {
  I.setLang(code);
  if (user) store.set("gcas-lang", code);
  document.documentElement.lang = code;
  loadCjkFont(code);
  I.translateDom(document.body);
  buildLangMenu();
  if (!langReady) return;
  setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  syncModelUI(); syncLogoUI(); buildAnimPresets(); buildPresets(); pairsDirty = true;
  scheduleAnim(); scheduleLogo(true);
  if (IPL) { const n = frameNo; showIpl(); setFrame(n); }
  if (iniNotes.length) iniNotes = [];
}
applyLang(store.get("gcas-lang", null) || I.detect(), false);

/* ---------------- start ---------------- */
syncModelUI(); syncLogoUI();
/* until an IPL is loaded, only the drop zone is available: the Logotype tab and the tutorial wait for it */
const wantedTab = store.get("gcas-tab", "tabBtnAnim") === "tabBtnLogo" ? "tabBtnLogo" : "tabBtnAnim";
showTab("tabBtnAnim", true); $("tabBtnLogo").disabled = true; $("helpBtn").disabled = true;
renderLogo();
langReady = true;
restoreFont();
document.fonts.load('100px "Michroma"').then(() => { G.logo.clearCache(); scheduleLogo(true); }, () => {});
})();
