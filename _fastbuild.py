# -*- coding: utf-8 -*-
"""快速重建：复用正式产物里已编码好的 IMG/AUDIO/字体，只把最新模板套上去。
资源不变时产物与 `python _build.py --inline-music` 完全等价，但秒级完成，
方便只改 JS/CSS 时反复做浏览器实截迭代。"""
import io, json, re, os

WORK = r'C:\Users\陈福圣\WorkBuddy\2026-11-02-08-47-09'
PROD = os.path.join(WORK, 'princess-dressup.html')
TPL = os.path.join(WORK, '_game_template.html')

prod = io.open(PROD, encoding='utf-8').read()
tpl = io.open(TPL, encoding='utf-8').read()

def grab(var):
    marker = 'const %s = ' % var
    i = prod.index(marker) + len(marker)
    _, end = json.JSONDecoder().raw_decode(prod[i:])
    return prod[i:i + end]

img, audio = grab('IMG'), grab('AUDIO')
font = re.search(r'url\(data:font/ttf;base64,([A-Za-z0-9+/=]+)\)', prod).group(1)

out = (tpl.replace('__ASSETS_JSON__', img)
          .replace('__AUDIO_JSON__', audio)
          .replace('__FONT_B64__', font))
if any(x in out for x in ('__ASSETS_JSON__', '__AUDIO_JSON__', '__FONT_B64__')):
    raise SystemExit('placeholder left unreplaced')
io.open(PROD, 'w', encoding='utf-8', newline='').write(out)
print('fastbuild ok | assets=%d bytes | audio=%d bytes | html=%.2f MB'
      % (len(img), len(audio), len(out.encode('utf-8')) / 1024 / 1024))
