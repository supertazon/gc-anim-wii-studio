import re, os
d = os.path.dirname(os.path.abspath(__file__))
t = open(os.path.join(d, 'template.html'), encoding='utf-8').read()
t = re.sub(r'/\*@INCLUDE (\S+)\*/', lambda m: open(os.path.join(d, m.group(1)), encoding='utf-8').read(), t)
# standalone version for any static host (GitHub Pages serves docs/index.html)
page = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<link rel="icon" href="favicon.png" type="image/png">\n<style>body{margin:0}img{max-width:100%}</style>\n</head>\n<body>\n' + t + '\n</body>\n</html>\n')
out = os.path.join(d, 'docs')
os.makedirs(out, exist_ok=True)
open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(page)
print('built', len(t))
