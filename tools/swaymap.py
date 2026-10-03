"""Rig the Makise picture so its hair and jacket move on their own: python tools/swaymap.py

Reads wallpaper/img/makise.webp and writes beside it:
  makise-layers.png  the moving layers, at full size: red the hair, green the jacket with
                     the arms in it (and the hand), blue what is filled in beneath them
  makise-under.webp  the picture with the hair and jacket lifted off and the gap filled
                     from around it (half size): what shows where they swing aside
  makise-sway.png    how far each part moves (quarter size): red the hair (a little all
                     over, more on the bangs, most down the long lock), green the jacket
                     and arms swinging from the shoulders, blue how loosely the cloth hangs
                     (the cuffs and hem, away from the body, flutter)
The layers are keyed on the colours of the hair and jacket inside regions placed by hand
for this picture, so they fit it alone. They can be touched up in any paint program:
keep the layers' edges crisp and the sway soft. Needs Pillow.
"""
import math
import pathlib
from functools import reduce
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageMath

img = pathlib.Path(__file__).resolve().parent.parent / 'wallpaper' / 'img'

# Hand-placed for this picture, in its pixels.
CROWN = (418, 40)                    # the hair grows looser the further it hangs from here
HEAD = [(290, 0), (590, 0), (590, 300), (290, 300)]  # where hair can be, by its colour
NOT_HAIR = [(388, 232), (452, 232), (452, 300), (388, 300)]  # the collar and the knot of the tie
LOCK = [                             # the long lock over her left shoulder, traced: all hair, though
    (466, 290), (527, 290), (530, 330), (537, 350), (546, 380), (549, 430), (553, 450),  # in shadow
    (558, 500), (559, 550), (557, 590), (549, 608), (540, 596), (535, 550), (530, 500),  # it looks
    (524, 450), (520, 430), (512, 400), (506, 380), (490, 350), (478, 330)]              # like the jacket
BANGS = [(350, 55), (450, 55), (450, 165), (350, 165)]  # hanging over the forehead and eyes
KEEP = [(378, 155, 24, 17), (455, 138, 26, 18), (496, 142, 12, 24)]  # eyes and ear (centre, radii)
FACE = (418, 182, 54, 64)            # over the face only line art is taken in around the hair
JACKET_ZONES = [
    [(300, 262), (356, 278), (356, 598), (325, 640), (278, 690), (276, 835), (215, 890), (145, 890), (145, 260)],
    [(505, 240), (600, 270), (660, 420), (760, 790), (760, 850), (628, 860), (628, 925), (570, 925),
     (546, 860), (546, 650), (520, 600)],
]
CUFFS = [                            # part of the jacket whatever their colour: the cuffs and the hand
    [(156, 788), (212, 798), (212, 872), (186, 880), (156, 866)],
    [(664, 786), (740, 790), (748, 846), (690, 850), (664, 836)],
    [(576, 846), (624, 846), (624, 916), (576, 916)],
]
MID = 440                            # the middle of her body

smooth = lambda a, b, x: 0.0 if x <= a else 1.0 if x >= b else (lambda u: u * u * (3 - 2 * u))((x - a) / (b - a))
mul = lambda *ims: reduce(ImageChops.multiply, ims)
band = lambda ch, lo, hi: ch.point(lambda v: 255 if lo <= v <= hi else 0)
deg = lambda d: round(d * 255 / 360)
closing = lambda m, n: m.filter(ImageFilter.MaxFilter(n)).filter(ImageFilter.MinFilter(n))
opening = lambda m, n: m.filter(ImageFilter.MinFilter(n)).filter(ImageFilter.MaxFilter(n))


def shapes(size, polys=(), ellipses=()):
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon(p, fill=255)
    for x, y, rx, ry in ellipses:
        d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=255)
    return m


def fill(im, hole):
    """Fill `hole` (255 = to fill) from around it with a push-pull pyramid: near its edge
    it takes the colours just outside, deep inside a blend of them all."""
    ev = ImageMath.unsafe_eval
    known = ev('1.0 - h / 255.0', h=hole.convert('F'))
    r, g, b, a = (c.convert('F') for c in im.split())
    a = ev('a / 255.0', a=a)
    w = ev('k * a', k=known, a=a)  # colour comes only from known, opaque pixels
    levels = [[ev('c * w', c=c, w=w) for c in (r, g, b)] + [w, ev('a * k', a=a, k=known), known]]
    while max(levels[-1][0].size) > 1:
        size = tuple(max(1, s // 2) for s in levels[-1][0].size)
        levels.append([c.resize(size, Image.BOX) for c in levels[-1]])
    up = None
    for pr, pg, pb, w, pa, k in reversed(levels):
        here = [ev('c / max(w, 0.000001)', c=c, w=w) for c in (pr, pg, pb)] + [ev('pa / max(k, 0.000001)', pa=pa, k=k)]
        if up:
            trust = [ev('min(w * 4.0, 1.0)', w=w)] * 3 + [ev('min(k * 4.0, 1.0)', k=k)]
            up = [u.resize(pr.size, Image.BILINEAR) for u in up]
            here = [ev('h * t + u * (1.0 - t)', h=h, t=t, u=u) for h, t, u in zip(here, trust, up)]
        up = here
    to8 = lambda c, s=1.0: ev('convert(min(max(c * s, 0.0), 255.0), "L")', c=c, s=s)
    filled = Image.merge('RGBA', [to8(c) for c in up[:3]] + [to8(up[3], 255.0)])
    return Image.composite(filled, im, hole)


im = Image.open(img / 'makise.webp').convert('RGBA')
W, H = im.size
hue, sat, val = im.convert('RGB').convert('HSV').split()
opaque = band(im.getchannel('A'), 129, 255)

# The hair: chestnut, redder and more saturated than the khaki jacket (and less than the
# tie), plus the traced lock. Close the gaps in its painted texture and widen it a little
# to take in the line art around each lock; over the face take in only the dark line
# art, and over the eyes and the ear nothing but the hair itself.
hair_raw = ImageChops.lighter(
    mul(band(hue, deg(9), deg(29)), band(sat, 90, 215), band(val, 18, 255), opaque,
        ImageChops.subtract(shapes(im.size, [HEAD]), shapes(im.size, [NOT_HAIR]))),
    mul(shapes(im.size, [LOCK]), opaque))
hair = opening(closing(hair_raw, 9), 3).filter(ImageFilter.MaxFilter(5))
lines = mul(hair_raw.filter(ImageFilter.MaxFilter(5)), band(val, 0, 90))
hair = Image.composite(ImageChops.lighter(closing(hair_raw, 5), lines), hair, shapes(im.size, ellipses=[FACE]))
keep = shapes(im.size, ellipses=KEEP)
hair = Image.composite(hair_raw, hair, keep)

# The jacket with the arms in it: khaki, plus its cuffs and the hand, with the straps and
# line art across it closed over. Where the hair lies over it, the hair has it.
jacket_raw = ImageChops.lighter(
    mul(band(hue, deg(25), deg(60)), band(sat, 30, 150), band(val, 62, 215), opaque, shapes(im.size, JACKET_ZONES)),
    mul(shapes(im.size, CUFFS), opaque))
jacket = opening(closing(jacket_raw, 15), 5).filter(ImageFilter.MaxFilter(5))
jacket = ImageChops.subtract(jacket, hair)

# What has to be filled in beneath them: a little more than both, so nothing of them is left.
hole = ImageChops.lighter(hair, jacket).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1))
soft = lambda m: m.filter(ImageFilter.GaussianBlur(0.7))
Image.merge('RGB', (soft(hair), soft(jacket), hole)).save(img / 'makise-layers.png', optimize=True)
fill(im, hole).resize((W // 2, H // 2), Image.LANCZOS).save(img / 'makise-under.webp', quality=88, method=6)

# How far each part moves, at quarter size (it is all soft). Each reaches well past its
# layer, so a lock or a cuff can swing out over what's beside it.
q = (W // 4, H // 4)
reach = lambda m: m.resize(q, Image.BOX).point(lambda v: 255 if v > 20 else 0) \
    .filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(2)).load()
hr, jr = reach(hair), reach(jacket)
bangs = shapes(q, [[(x // 4, y // 4) for x, y in BANGS]]).filter(ImageFilter.GaussianBlur(3)).load()
eyes = keep.resize(q, Image.BOX).filter(ImageFilter.GaussianBlur(2)).load()
r, g, b = (Image.new('L', q) for _ in range(3))
rp, gp, bp = r.load(), g.load(), b.load()
for j in range(q[1]):
    for i in range(q[0]):
        x, y = i * 4 + 2, j * 4 + 2
        # Hair: a little all over, looser the further it hangs from the crown; the bangs
        # swing from the hairline; her right side, tucked behind the collar, is held
        # there, and the few strands over her eyes (whose line art can't be told from the
        # lashes) barely stir.
        w = 0.12 + 0.88 * smooth(60, 560, math.hypot(x - CROWN[0], y - CROWN[1]))
        w = max(w, bangs[i, j] / 255 * (0.12 + 0.3 * smooth(70, 150, y)))
        if x < 400:
            w *= 1 - 0.6 * smooth(235, 295, y)
        w *= 1 - 0.75 * eyes[i, j] / 255
        rp[i, j] = round(255 * w * hr[i, j] / 255)
        # Jacket: swings from the shoulders, less where it lies on her body; the cuffs
        # and hem hanging away from it are loose.
        side = smooth(70, 190, abs(x - MID))
        gp[i, j] = round((0.35 + 0.65 * side) * jr[i, j])
        bp[i, j] = round(smooth(500, 860, y) * side * jr[i, j])
Image.merge('RGB', (r, g, b)).save(img / 'makise-sway.png', optimize=True)

for f in ('makise-layers.png', 'makise-under.webp', 'makise-sway.png'):
    print(f'wrote img/{f} ({(img / f).stat().st_size // 1024} KB)')
