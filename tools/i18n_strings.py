#!/usr/bin/env python3
"""List every translatable English string of the page, and check the dictionaries.

  python3 tools/i18n_strings.py            # report missing / unused strings per language
  python3 tools/i18n_strings.py --list     # print the English strings (one JSON string per line)
"""
import re, os, sys, json
from html.parser import HTMLParser
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
norm = lambda s: re.sub(r'\s+', ' ', s).strip()
SKIP_TEXT = re.compile(r'^[\s\d.,:×◀▶™+\-−/…%()]*$|^(4:3|16:9|GC-anim-Wii Studio|gc-anim\.ini|HOMEBREW|NINTENDO|logo\.png)$')

class P(HTMLParser):
    def __init__(s):
        super().__init__(convert_charrefs=True); s.out = []; s.stack = []; s.htmlkey = None
    def handle_starttag(s, tag, attrs):
        a = dict(attrs)
        skip = bool(tag in ('script', 'style', 'textarea') or 'data-no-i18n' in a or (s.stack and s.stack[-1][1]))
        if 'data-i18n-html' in a and not skip: s.htmlkey = [tag, 0, ''] 
        elif s.htmlkey is not None: s.htmlkey[2] += self_tag(tag, attrs); s.htmlkey[1] += 1 if tag not in VOID else 0
        if tag not in VOID: s.stack.append((tag, skip))
        if not skip:
            for k in ('aria-label', 'placeholder', 'title', 'alt'):
                if a.get(k) and not SKIP_TEXT.match(a[k]): s.out.append(norm(a[k]))
    def handle_endtag(s, tag):
        if tag in VOID: return
        if s.htmlkey is not None:
            if s.htmlkey[1] == 0: s.out.append(norm(s.htmlkey[2])); s.htmlkey = None
            else: s.htmlkey[2] += '</%s>' % tag; s.htmlkey[1] -= 1
        if s.stack: s.stack.pop()
    def handle_data(s, d):
        if s.htmlkey is not None: s.htmlkey[2] += d.replace('&', '&amp;').replace('<', '&lt;'); return
        if s.stack and s.stack[-1][1]: return
        n = norm(d)
        if n and not SKIP_TEXT.match(n): s.out.append(n)
VOID = {'input', 'img', 'br', 'meta', 'link', 'hr'}
def self_tag(tag, attrs): return '<%s%s>' % (tag, ''.join(' %s="%s"' % (k, v) if v is not None else ' ' + k for k, v in attrs))

def strings():
    t = open(os.path.join(D, 'template.html'), encoding='utf-8').read()
    body = t[t.index('<div class="wrap">'):t.index('<script>\n/*@INCLUDE')]
    p = P(); p.feed(body); out = list(p.out)
    js = ''.join(open(os.path.join(D, 'src', f), encoding='utf-8').read() for f in ('app.js', 'ipl.js', 'config.js', 'promo.js'))
    lit = r'"((?:[^"\\]|\\.)*)"'
    for pat in (r'\b[tT]\(' + lit, r'\b(?:name|label|short): ' + lit, r'\["\w+", ' + lit + r'\]', r'swatch\(' + lit):
        out += [json.loads('"%s"' % m) for m in re.findall(pat, js)]
    seen, res = set(), []
    for s in out:
        if s and s not in seen and not SKIP_TEXT.match(s) and not re.match(r'^(apps/|tab[A-Z])', s): seen.add(s); res.append(s)
    return res

def dicts():
    out = {}
    for f in sorted(os.listdir(os.path.join(D, 'src', 'i18n'))):
        src = open(os.path.join(D, 'src', 'i18n', f), encoding='utf-8').read()
        m = re.search(r'GCA\.i18nDicts\["([\w-]+)"\] = (\{.*\});', src, re.S)
        out[m.group(1)] = json.loads(m.group(2))
    return out

if __name__ == '__main__':
    S = strings()
    if '--list' in sys.argv:
        for s in S: print(json.dumps(s, ensure_ascii=False))
        sys.exit(0)
    bad = 0
    for code, d in dicts().items():
        miss = [s for s in S if s not in d]; extra = [k for k in d if k not in S]
        ph = [s for s in S if s in d and sorted(re.findall(r'\{\w+\}', s)) != sorted(re.findall(r'\{\w+\}', d[s]))]
        print(f'{code}: {len(S) - len(miss)}/{len(S)} translated' + (f', {len(miss)} missing' if miss else '') + (f', {len(extra)} unused' if extra else '') + (f', {len(ph)} with wrong placeholders' if ph else ''))
        for s in miss[:5]: print('   missing:', s)
        for s in ph[:5]: print('   placeholders:', s)
        bad += len(miss) + len(ph)
    sys.exit(1 if bad else 0)
