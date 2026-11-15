# -*- coding: utf-8 -*-
"""构建脚本：把设计稿素材压缩成 WebP/JPEG data URL，注入游戏模板。
用法：python _build.py
产物：princess-dressup.html（单文件，图片 + 字体全部内联）
"""
import os, io, base64, json, re, sys, shutil
from PIL import Image, ImageChops

ROOT = r"D:\下载\换装\网页游戏\游戏界面基础素材图"
WORK = r"C:\Users\陈福圣\WorkBuddy\2026-11-02-08-47-09"
DL   = r"C:\Users\陈福圣\Downloads"

# 加 --inline-music 时把 5 首 BGM 一并 base64 内联，产物才是真正的单文件
INLINE_MUSIC = '--inline-music' in sys.argv

LAYER = (360, 518)      # 所有「穿戴图层」与人物立绘统一画布（1340:1928 ≈ 0.695）
ICONBOX = (112, 112)    # WARDROBE 格子里的缩略图

def load(rel):
    return Image.open(os.path.join(ROOT, rel)).convert('RGBA')

def to_url(img, fmt='WEBP', q=84, size=None, lossless=False):
    if size:
        img = img.resize(size, Image.LANCZOS if not lossless else Image.NEAREST)
    b = io.BytesIO()
    if fmt == 'WEBP':
        img.save(b, 'WEBP', quality=q, method=6, lossless=lossless)
        mime = 'webp'
    elif fmt == 'JPEG':
        bg = Image.new('RGB', img.size, (255, 255, 255))
        bg.paste(img, mask=img.split()[3])
        bg.save(b, 'JPEG', quality=q, optimize=True)
        mime = 'jpeg'
    else:
        img.save(b, 'PNG', optimize=True)
        mime = 'png'
    return 'data:image/%s;base64,%s' % (mime, base64.b64encode(b.getvalue()).decode())

def white_to_alpha(img, thr=240, soft=18):
    """把 JPG 白底抠成透明（化妆后立绘用）"""
    r, g, b, _ = img.split()
    mn = ImageChops.darker(ImageChops.darker(r, g), b)
    a = mn.point(lambda v: 0 if v >= thr else (255 if v <= thr - soft
                 else int(255 * (thr - v) / soft)))
    img.putalpha(a)
    return img

def crop_alpha(img, pad=0):
    """裁掉素材四周的透明留白，让按钮 / 弹窗框真正占满绘制矩形。
    注意：只用于「独立 UI 元素」，对齐类叠加图层（如 startGlow）不能裁。"""
    bb = img.split()[3].getbbox()
    if not bb:
        return img
    l, t, r, b = bb
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))

def crop_white(img, thr=20):
    """新版 4 张交互弹窗是 RGB 图，四周带白色留白；按与纯白的差异裁出有效内容。
    旧版素材自带 XP 标题栏，新版去掉了标题栏，名称改由统一弹窗的标题栏绘制。"""
    rgb = img.convert('RGB')
    white = Image.new('RGB', rgb.size, (255, 255, 255))
    d = ImageChops.difference(rgb, white).convert('L').point(lambda p: 255 if p > thr else 0)
    bb = d.getbbox()
    return img.crop(bb) if bb else img


def strip_roll_border(img, n=5):
    """谢幕两张滚动图自带约 3px 深色上下边框，上下拼接滚动时交界会露出黑线。
    裁掉边框后仍按原尺寸用背景青色补回，内容（含按钮）位置完全不变。"""
    w, h = img.size
    bg = img.convert('RGB').getpixel((w//2, h//2))
    out = Image.new('RGBA', (w, h), bg + (255,))
    out.paste(img.crop((0, n, w, h-n)), (0, n))
    return out

def icon_of(img):
    """按 alpha 包围盒裁剪图案，等比缩放进 ICONBOX"""
    bb = img.split()[3].getbbox()
    if not bb:
        bb = (0, 0, img.width, img.height)
    crop = img.crop(bb)
    w, h = crop.size
    s = min(ICONBOX[0] / w, ICONBOX[1] / h)
    nw, nh = max(1, int(w * s)), max(1, int(h * s))
    crop = crop.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGBA', ICONBOX, (0, 0, 0, 0))
    out.paste(crop, ((ICONBOX[0] - nw) // 2, (ICONBOX[1] - nh) // 2))
    return out

A = {}   # key -> data url

def put(key, img, **kw):
    A[key] = to_url(img, **kw)

# ---------- 通用 UI ----------
ui = [
    ('desk',        '桌面像素.png',                          'WEBP', 90, None,        True),
    ('computer',    'Start_computer.png',                   'WEBP', 92, None,        True),
    ('startGlow',   'Start.png',                            'WEBP', 92, None,        True),
    ('cursor',      'white_cursor数点击鼠标.png',           'PNG',  0,  None,        False),
    ('folderOpen',  '存档点（正常状态）.png',                'WEBP', 92, None,        True),
    ('folderLock',  '存档点（打不开） 6.png',                'WEBP', 92, None,        True),
    ('popupFrame',  '网页_无法穿戴的物品点击弹窗素材-01.png', 'WEBP', 88, (520, 609),  False),
    # 新版 4 张：去掉 XP 标题栏、只留粉底 + 描述 + 两个按钮，统一 900x400
    ('chooseDaisy', '小雏菊交互弹窗2.png',                   'WEBP', 92, (900, 400),  False),
    ('chooseGem',   '宝石交互弹窗2.png',                     'WEBP', 92, (900, 400),  False),
    ('chooseClass', '上课还是画画交互弹窗2.png',              'WEBP', 92, (900, 400),  False),
    ('chooseRemake','是否穿remake T恤交互弹窗2.png',         'WEBP', 92, (900, 400),  False),
    ('saveBtn',     '保存装扮.png',                          'WEBP', 90, (200, 131),  False),
    ('musicBtn',    '音乐ui.png',                            'WEBP', 92, None,        True),
    ('closeBtn',    '关闭ui.png',                            'WEBP', 90, (44, 44),    False),
    # 谢幕改用两张独立滚动图（游戏结束.png 只是它们上下拼接的合版，不再需要）
    ('endRoll1',    '滚动图片1.png',                         'WEBP', 92, None,        False),
    ('endRoll2',    '滚动图片2.png',                         'WEBP', 92, None,        False),
]
CROP_KEYS = {'popupFrame', 'saveBtn', 'closeBtn'}
CROP_WHITE_KEYS = {'chooseDaisy', 'chooseGem', 'chooseClass', 'chooseRemake'}
for key, rel, fmt, q, size, lossless in ui:
    img = load(rel)
    if key in CROP_KEYS:
        img = crop_alpha(img, pad=4)
    if key in CROP_WHITE_KEYS:
        img = crop_white(img)
    if key in ('endRoll1', 'endRoll2'):
        img = strip_roll_border(img)
    put(key, img, fmt=fmt, q=q, size=size, lossless=lossless)

for age in [5, 8, 12, 15, 18]:
    put('folderDone%d' % age,
        load('%d岁存档.png' % age), fmt='WEBP', q=92, lossless=True)

# ---------- 5 个年龄段场景 ----------
for age in [5, 8, 12, 15, 18]:
    d = '%d岁' % age
    put('bg%d' % age,    load('%s/%d岁背景.png' % (d, age)),  fmt='JPEG', q=84, size=(960, 640))
    put('char%d' % age,  load('%s/%d岁像素.png' % (d, age)),  fmt='WEBP', q=84, size=LAYER)
    put('stage%d' % age, load('%s/%d岁换妆台.png' % (d, age)), fmt='WEBP', q=84, size=(460, 306))

MAKEUP = {
    12: '12岁/点击完口红自动替换这个.jpg',
    15: '15岁/点击完化妆品后自动替换.jpg',
    18: '18岁/点完化妆包之后自动替换.jpg',
}
for age, rel in MAKEUP.items():
    put('makeup%d' % age, white_to_alpha(load(rel)), fmt='WEBP', q=84, size=LAYER)

# ---------- 45 件物品 + 变体 ----------
ITEMS_SRC = {
    # 5 岁
    'a5_daisy':      '5岁/5岁雏菊像素.png',
    'a5_top':        '蓬蓬裙上身.png',
    'a5_skirt':      '蓬蓬裙下身.png',
    'a5_rabbit':     '5岁/5岁紫兔子jellycat像素.png',
    # 8 岁
    'a8_gem':        '8岁/8岁宝石像素.png',
    'a8_tshirt':     '8岁/8岁蓝T恤像素.png',
    'a8_sandals':    '8岁/8岁凉鞋像素.png',
    'a8_denim':      '8岁/8岁牛仔裙像素.png',
    'a8_trousers':   '8岁/8岁七分裤像素.png',
    'a8_sketch':     '8岁/8岁图画本像素.png',
    'a8_warmers':    '8岁/8岁袖套像素.png',
    # 12 岁
    'a12_pants':     '12岁/12岁束脚裤.png',
    'a12_ipad':      '12岁/12岁ipad.png',
    'a12_trainers':  '12岁/12岁运动鞋.png',
    'a12_hoodie':    '12岁/12岁高领上衣.png',
    'a12_notebook':  '12岁/12岁笔记本像素.png',
    'a12_lipstick':  '12岁/12岁口红像素.png',
    # 15 岁
    'a15_nails':     '15岁/15岁穿戴甲.png',
    'a15_earrings':  '15岁/15岁耳环.png',
    'a15_blacktee':  '15岁/15岁黑T恤.png',
    'a15_jeans':     '15岁/15岁牛仔裤.png',
    'a15_headphones':'15岁/15岁头戴式耳机.png',
    'a15_jacket':    '15岁/15岁外套.png',
    'a15_boots':     '15岁/15岁靴子.png',
    'a15_ipad':      '15岁/15岁ipad画画弹窗.png',
    'a15_cosmetics': '15岁/15岁化妆品.png',
    'a15_remake':    '15岁/15岁remakeT恤.png',
    # 18 岁
    'a18_piercings': '18岁/18岁鼻钉唇钉.png',
    'a18_pinkpants': '18岁/18岁粉色卫裤.png',
    'a18_pinkpearl': '18岁/18岁粉色珍珠项链.png',
    'a18_makeupbag': '18岁/18岁化妆包.png',
    'a18_coat':      '18岁/18岁黄色豹纹外套.png',
    'a18_tights':    '18岁/18岁黄丝袜.png',
    'a18_tote':      '18岁/18岁托特包像素.png',
    'a18_starear':   '18岁/18岁五角星耳环.png',
    'a18_pearlear':  '18岁/18岁珍珠耳饰.png',
    'a18_necklace':  '18岁/18岁珍珠项链.png',
    'a18_macbook':   '18岁/18岁macbook.png',
    'a18_hairdye':   '18岁/18岁蓝色条纹染.png',
    'a18_blueshoes': '18岁/18岁蓝色鞋子.png',
    'a18_magenta':   '18岁/18岁玫红色吊带.png',
    'a18_books':     '18岁/18岁书堆.png',
    'a18_queentop':  '18岁/18岁蓝色吊带.png',
    'a18_fringed':   '18岁/18岁蓝色短裙.png',
    'a18_bunny':     '18岁/18岁fuggler兔子像素.png',
}
VARIANTS = {
    'sketch_no':       '（无雏菊的）图画本.png',
    'sketch_yes':      '（有雏菊的）图画本.png',
    'gem_hand':        '8岁/8岁宝石弹窗.png',
    'ipad_active12':   '12岁/12岁ipad弹窗.png',
    'notebook_open':   '12岁/12岁笔记本内页像素.png',
    'notebook_sticker':'12岁/12岁笔记本内页贴纸像素.png',
    'nails_hand':      '15岁/15岁穿戴甲弹窗.png',
    'macbook_diamond': '18岁/18岁钻石macbook.png',
}
ALL_PICS = dict(ITEMS_SRC); ALL_PICS.update(VARIANTS)
# 这张紫兔子是白底调色板 PNG、无 transparency 信息：不抠白底会整块盖住人物立绘
NO_ALPHA = {'a5_rabbit'}

# 18 岁珍珠耳饰：按源素材原始尺寸还原（用户明确要求「太大了，还原到之前的大小」）。
# 之前误判成「图案太小看不见」而放大过 1.8 倍；真实原因是蓝色染发图层(z=60)
# 盖住了耳环(z=52)，已由 _game_template.html 的 layerZ() 规则修正绘制顺序。
# 这里不再对源图做任何放大 / 缩放预处理，珍珠回到原图那一对小圆点的尺寸。
for key, rel in ALL_PICS.items():
    img = load(rel)
    if key in NO_ALPHA:
        img = white_to_alpha(img)
    put('L_' + key, img, fmt='WEBP', q=84, size=LAYER)
    put('T_' + key, icon_of(img), fmt='WEBP', q=88)

# ---------- 「手持 / 使用中」道具：紧裁成独立插画 ----------
# 设计稿里这些道具是浮在人物立绘左右的小插画，不是 360x518 全身对齐图层。
# 源图四周有大量透明留白，直接按 L_ 全画布叠加会盖住人物或缩得看不见；
# 这里按 alpha 包围盒紧裁，游戏端用 PROP_PLACE 单独定位绘制。
PROP_PICS = {
    'gem_hand':         '8岁/8岁宝石弹窗.png',
    'sketch_no':        '（无雏菊的）图画本.png',
    'sketch_yes':       '（有雏菊的）图画本.png',
    'ipad12':           '12岁/12岁ipad弹窗.png',
    'notebook_open':    '12岁/12岁笔记本内页像素.png',
    'notebook_sticker': '12岁/12岁笔记本内页贴纸像素.png',
    'nails_hand':       '15岁/15岁穿戴甲弹窗.png',
    'ipad15':           '15岁/15岁ipad画画弹窗.png',
}
for key, rel in PROP_PICS.items():
    img = crop_alpha(load(rel), pad=2)
    # 游戏里最大只显示约 200 物理像素宽，等比限到 480 足够，避免几百 KB 的无用像素
    img.thumbnail((480, 480), Image.LANCZOS)
    put('P_' + key, img, fmt='WEBP', q=88)

# 5 岁蓬蓬裙：物品栏图标 / 弹窗大图直接用 a5_skirt 的紧裁图标，
# 源文件就是「蓬蓬裙下身.png」（单独的粉色裙摆），与穿戴图层 L_a5_skirt 同源。
# 不再替换成「5岁蓬蓬裙（物品栏）像素.png」那张上衣+裙摆的整套展示图。
# 弹窗大图统一用「按 alpha 紧裁过的 T_ 缩略图」，L_ 是 360x518 全画布图层，
# 大部分透明，直接放弹窗里会让物品显得极小。
A['BIG_a8_gem'] = A['T_gem_hand']
A['BIG_a15_nails'] = A['T_nails_hand']
A['BIG_a12_ipad'] = A['T_ipad_active12']
# 8 岁图画本弹窗大图由 resolveKey 按雏菊分支取 T_sketch_no / T_sketch_yes（打开的图画本），
# 不再额外生成 BIG_a8_sketch；物品栏固定用 T_a8_sketch（8岁图画本像素.png，合上的本子）。
A['BIG_a12_notebook'] = A['T_notebook_open']
A['BIG_a15_ipad'] = A['T_a15_ipad']

# ---------- 字体：从现有 HTML 抽出已子集化的点点像素体 ----------
old = open(os.path.join(WORK, 'princess-dressup.html'), encoding='utf-8').read()
m = re.search(r'url\(data:font/ttf;base64,([A-Za-z0-9+/=]+)\)', old)
if not m:
    raise SystemExit('找不到已内联的像素字体')
FONT_B64 = m.group(1)

# ---------- 音乐：默认放 music/ 便于开发调试；--inline-music 时内联成单文件 ----------
MUSIC = {
    5:  '5-lucky one-mich.mp3',
    8:  '8-Mad at Disney-salem ilese.mp3',
    12: '12-Hotel-Claire Rosinkranz.mp3',
    15: '15-hate that i made you love me-Ariana Grande.mp3',
    18: '18-NewJeans-New Jeans.mp3',
}
mdir = os.path.join(WORK, 'music')
os.makedirs(mdir, exist_ok=True)
AUDIO = {}
for age, fn in MUSIC.items():
    s = os.path.join(DL, fn)
    if not os.path.exists(s):
        continue
    shutil.copyfile(s, os.path.join(mdir, '%d.mp3' % age))
    if INLINE_MUSIC:
        AUDIO[str(age)] = base64.b64encode(open(s, 'rb').read()).decode()

# ---------- 注入模板 ----------
tpl = open(os.path.join(WORK, '_game_template.html'), encoding='utf-8').read()
assets_json = json.dumps(A, ensure_ascii=False, separators=(',', ':'))
audio_json = json.dumps(AUDIO, separators=(',', ':'))
out = (tpl.replace('__FONT_B64__', FONT_B64)
          .replace('__ASSETS_JSON__', assets_json)
          .replace('__AUDIO_JSON__', audio_json))
if '__FONT_B64__' in out or '__ASSETS_JSON__' in out or '__AUDIO_JSON__' in out:
    raise SystemExit('模板占位符未完全替换')
p = os.path.join(WORK, 'princess-dressup.html')
open(p, 'w', encoding='utf-8', newline='').write(out)
print('assets:', len(A), '| font b64:', len(FONT_B64),
      '| inline BGM:', len(AUDIO),
      '| HTML:', round(len(out.encode('utf-8')) / 1024 / 1024, 2), 'MB')
print('music files:', len([f for f in os.listdir(mdir) if f.endswith('.mp3')]))
