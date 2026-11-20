/* i18n.js - translations. English text is the key ("gettext" style): the page is written in
 * English, and each language maps an English string to its translation. Anything missing
 * falls back to English. Placeholders: {name}. */
var GCA = GCA || {};
(function (G) {
  const LANGS = [
    { code: "en", name: "English" }, { code: "fr", name: "Français" }, { code: "es", name: "Español" },
    { code: "pt-BR", name: "Português (Brasil)" }, { code: "pt-PT", name: "Português (Portugal)" },
    { code: "it", name: "Italiano" }, { code: "de", name: "Deutsch" }, { code: "ja", name: "日本語" },
    { code: "zh-CN", name: "简体中文" }, { code: "ko", name: "한국어" }
  ];
  const DICT = G.i18nDicts || {};
  let lang = "en";
  const norm = s => s.replace(/\s+/g, " ").trim();
  function t(s, vars) {
    const d = DICT[lang];
    let out = (d && d[s]) || s;
    if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return out;
  }
  /* pick a language from the browser's preferences */
  function detect() {
    const prefs = (typeof navigator !== "undefined" && (navigator.languages || [navigator.language])) || [];
    for (const p of prefs) {
      if (!p) continue;
      const l = p.toLowerCase();
      const exact = LANGS.find(x => x.code.toLowerCase() === l); if (exact) return exact.code;
      if (l.startsWith("pt")) return l === "pt-pt" || l.startsWith("pt-pt") ? "pt-PT" : "pt-BR";
      if (l.startsWith("zh")) return "zh-CN";
      const base = LANGS.find(x => x.code.split("-")[0] === l.split("-")[0]); if (base) return base.code;
    }
    return "en";
  }
  /* translate the static page: text nodes, a few attributes, and elements marked data-i18n-html */
  const ATTRS = ["aria-label", "placeholder", "title", "alt"];
  const orig = new WeakMap();
  function translateDom(root) {
    root.querySelectorAll("[data-i18n-html]").forEach(el => {
      if (!orig.has(el)) orig.set(el, el.innerHTML);
      const src = orig.get(el), key = norm(src), tr = DICT[lang] && DICT[lang][key];
      el.innerHTML = tr || src;
    });
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        const p = n.parentElement;
        if (!p || p.closest("script,style,textarea,[data-i18n-html],[data-no-i18n]")) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      if (!orig.has(n)) orig.set(n, n.nodeValue);
      const src = orig.get(n), key = norm(src);
      if (!key) continue;
      const tr = t(key);
      n.nodeValue = tr === key ? src : src.match(/^\s*/)[0] + tr + src.match(/\s*$/)[0];
    }
    root.querySelectorAll("[" + ATTRS.join("],[") + "]").forEach(el => {
      if (el.closest("[data-no-i18n]")) return;
      let o = orig.get(el); if (!o) { o = {}; for (const a of ATTRS) if (el.hasAttribute(a)) o[a] = el.getAttribute(a); orig.set(el, o); }
      for (const a in o) el.setAttribute(a, t(norm(o[a])));
    });
  }
  function setLang(code) { lang = LANGS.some(l => l.code === code) ? code : "en"; }
  G.i18n = { LANGS, t, detect, translateDom, setLang, get lang() { return lang; }, dicts: DICT };
  G.t = t;
})(GCA);
