"""Make the starting rig for the Makise picture: python tools/rigmap.py

Reads wallpaper/img/makise.webp and writes beside it makise-rig.js and the masks it
names (makise-rig-0.png, -1.png, -2.png: three masks to each, red, green and blue, at
half the picture's size). Touch the rig up afterwards in tools/rig.html; running this
again starts it over.

The masks come from the colours of the hair and the jacket inside regions placed by hand
for this picture, so they fit it alone:
  hold       her face and eyes, neck, shirt, tie, belt, shorts and legs, and a soft
             margin around them over whatever moves beside them (so the hair and coat
             bend there instead of dragging them along)
  hair       sways: a little all over, more down the bangs, most down the long lock and
             the loose ends, little where it rests on her shoulders
  ripples    waves running down the hair
  arms       each side of the jacket swings from its shoulder (its cuff the most),
             and less close to her body
  flutter    waves through the loose cuffs and hem
  breath     everything above her chest, easing off to nothing at the waist
  head       her head, a little nearer than the rest (parallax)
Needs Pillow, NumPy and SciPy.
"""
import json
import pathlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

img = pathlib.Path(__file__).resolve().parent.parent / 'wallpaper' / 'img'

# Hand-placed for this picture, in its pixels.
CROWN = (418, 40)                    # the hair grows looser the further it hangs from here
HEAD = [(290, 0), (612, 0), (612, 306), (290, 306)]  # where hair can be, by its colour
NOT_HAIR = [(386, 214), (458, 214), (466, 306), (380, 306)]  # the collar and the knot of the tie
LOCK = [                             # the long lock over her left shoulder: all hair, though in
    (480, 284), (486, 310), (492, 330), (500, 350), (507, 370), (513, 390), (518, 410),  # shadow
    (522, 430), (526, 450), (528, 470), (530, 500), (532, 530), (536, 560), (542, 585),  # it looks
    (550, 599), (557, 596), (560, 570), (560, 540), (558, 500), (554, 470), (551, 440),  # like the
    (547, 415), (541, 395), (536, 370), (531, 345), (529, 320), (528, 300), (527, 284)]  # jacket
BANGS = [(350, 55), (450, 55), (450, 165), (350, 165)]  # hanging over the forehead and eyes
EYES = [(379, 157, 25, 18), (454, 138, 27, 19), (500, 142, 13, 25)]  # eyes and ear (centre, radii)
FACE = [(358, 118), (470, 100), (492, 128), (480, 195), (448, 232), (425, 240), (395, 222), (366, 192)]
TORSO = [                            # neck, collar, shirt and tie, between the jacket's edges
    (334, 288), (384, 236), (398, 214), (446, 214), (462, 236), (478, 284), (486, 310),
    (492, 330), (500, 350), (507, 370), (513, 390), (518, 410), (522, 430), (526, 450),
    (528, 470), (530, 500), (532, 540), (530, 580), (530, 622), (300, 628), (298, 600),
    (312, 520), (321, 420), (328, 330)]
LEGS = [(296, 612), (532, 615), (548, 640), (546, 1040), (266, 1040), (266, 690), (282, 640)]  # belt, shorts, legs
JACKET = [
    [(300, 262), (356, 278), (356, 598), (325, 640), (278, 690), (276, 835), (215, 890), (145, 890), (145, 260)],
    [(505, 240), (600, 270), (660, 420), (760, 790), (760, 850), (628, 860), (628, 925), (570, 925),
     (546, 860), (546, 650), (520, 632), (490, 600), (486, 470), (500, 420)],
]
CUFFS = [                            # part of the jacket whatever their colour: the cuffs and the hand
    [(156, 788), (212, 798), (212, 872), (186, 880), (156, 866)],
    [(664, 786), (740, 790), (748, 846), (690, 850), (664, 836)],
    [(576, 846), (624, 846), (624, 916), (576, 916)],
]
SHOULDERS = [(330, 300), (585, 295)]  # where each side of the jacket swings from
ARM = 550                            # from shoulder to cuff
MID = 440                            # the middle of her body
CHEST = (290, 620)                   # rows over which the breath eases off, shoulders to waist
NECK = (230, 330)                    # rows over which the head's parallax eases off
MARGIN = 16                          # how far the hold reaches over what moves beside it (px)

im = Image.open(img / 'makise.webp').convert('RGBA')
W, H = im.size
hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.float32)
hue, sat, val = hsv[..., 0] * 360 / 255, hsv[..., 1], hsv[..., 2]
opaque = np.asarray(im.getchannel('A')) > 128
ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)


def shapes(polys=(), ellipses=()):
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon(p, fill=255)
    for x, y, rx, ry in ellipses:
        d.ellipse((x - rx, y - ry, x + rx, y + ry), fill=255)
    return np.asarray(m) > 0


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


disk = lambda r: (np.hypot(*np.mgrid[-r:r + 1, -r:r + 1]) <= r)
close = lambda m, r: ndimage.binary_closing(m, disk(r), border_value=0)
open_ = lambda m, r: ndimage.binary_opening(m, disk(r))
grow = lambda m, r: ndimage.binary_dilation(m, disk(r))
blur = lambda m, s: ndimage.gaussian_filter(m.astype(np.float32), s)


def reach(m, inside, out):
    """1 on `m` (and `inside` px around it), easing to 0 `out` px further out."""
    d = ndimage.distance_transform_edt(~m)
    return 1 - smooth(inside, inside + out, d)


# The hair: chestnut, redder and more saturated than the khaki jacket (and less than the
# tie), plus the traced lock (but never the white of the shirt beside it), its gaps closed.
white = opaque & (sat < 50) & (val > 120)
hair = opaque & (hue >= 9) & (hue <= 29) & (sat >= 90) & (sat <= 215) & (val >= 18) & shapes([HEAD]) & ~shapes([NOT_HAIR])
hair = open_(close(hair, 4), 1) | (shapes([LOCK]) & opaque & ~white)
hair = ndimage.binary_fill_holes(close(hair, 3))

# The jacket with the arms in it: khaki, plus its cuffs and the hand, the straps and line
# art across it closed over. Where the hair lies over it, the hair has it.
jacket = opaque & (hue >= 25) & (hue <= 60) & (sat >= 30) & (sat <= 150) & (val >= 62) & (val <= 215) & shapes(JACKET)
jacket = open_(close(jacket, 7), 2) | (shapes(CUFFS) & opaque)
jacket = ndimage.binary_fill_holes(close(jacket, 3)) & ~hair

# What must never bend: whatever of her body isn't hair or jacket, and her eyes.
body = (shapes([TORSO, FACE, LEGS]) & opaque & ~grow(hair, 1) & ~grow(jacket, 1)) | shapes(ellipses=EYES)
body = ndimage.binary_fill_holes(open_(close(body, 3), 2))
hold = reach(body, 1, MARGIN)

# The hair sways: a little all over, looser the further it hangs from the crown; the bangs
# swing from the hairline, the few strands over her eyes (whose line art can't be told
# from the lashes) are held with them; where it rests on her shoulders it stays, and the
# long lock swings more toward its tip. Its mask reaches well past it, softly, so the
# coat and the air beside it make room.
crown = np.hypot(xs - CROWN[0], ys - CROWN[1])
w = 0.15 + 0.85 * smooth(60, 560, crown)
w = np.maximum(w, blur(shapes([BANGS]), 12) * (0.12 + 0.3 * smooth(70, 150, ys)))
lock = blur(shapes([LOCK]), 6)
rests = (1 - 0.75 * smooth(232, 300, ys)) * (1 - lock)
w = w * rests + (0.35 + 0.65 * smooth(300, 590, ys)) * lock
hair_reach = reach(hair, 2, 22)
sway = blur(hair_reach * blur(w, 3), 3)
ripples = blur(hair_reach * blur(0.2 + 0.8 * smooth(90, 420, crown), 3), 3)

# The jacket: each side turns from its shoulder (so its cuff moves the most), less close
# to her body and not at all at the shoulder itself; the cuffs and hem, hanging away from
# her, flutter.
near = ndimage.distance_transform_edt(~body)
coat = reach(jacket, 1, 10)
loose = 0.3 + 0.7 * smooth(8, 60, near)
arms = [coat * (xs < MID if i == 0 else xs >= MID) * smooth(20, 140, np.hypot(xs - x, ys - y)) * loose
        for i, (x, y) in enumerate(SHOULDERS)]
arms = [blur(a, 4) for a in arms]
flutter = blur(coat * smooth(500, 860, ys) * smooth(70, 190, np.abs(xs - MID)) * loose, 4)

# She breathes from the shoulders up, easing off to nothing at the waist; her head sits a
# little nearer than the rest.
breath = 1 - smooth(CHEST[0], CHEST[1], ys)
head = (1 - smooth(NECK[0], NECK[1], ys)) * blur(reach(opaque, 4, 30), 8)

# Three masks to a PNG, at half size.
q = ((W + 1) // 2, (H + 1) // 2)
half = lambda m: Image.fromarray(np.uint8(np.clip(m, 0, 1) * 255 + 0.5)).resize(q, Image.BOX)
maps = [[hold, sway, ripples], [arms[0], arms[1], flutter], [breath, head, np.zeros((H, W))]]
names = []
for i, chans in enumerate(maps):
    names.append(f'makise-rig-{i}.png')
    Image.merge('RGB', [half(m) for m in chans]).save(img / names[-1], optimize=True)

# The rig itself: settings in the picture's own px.
effects = [
    {'kind': 'hold', 'name': 'Body', 'mask': [0, 0]},
    {'kind': 'sway', 'name': 'Hair', 'mask': [0, 1], 'gain': 2.2, 'wind': 3.7, 'hz': 0.55, 'damp': 0.3, 'max': 13},
    {'kind': 'wave', 'name': 'Hair ripples', 'mask': [0, 2], 'amount': 0.65, 'length': 250, 'speed': 67, 'dir': 90, 'gust': 2.25, 'vary': 1.4},
    {'kind': 'swing', 'name': 'Right arm', 'mask': [1, 0], 'pivot': list(SHOULDERS[0]), 'length': ARM,
     'gain': 1.3, 'wind': 1.65, 'hz': 0.6, 'damp': 0.4, 'max': 5.8},
    {'kind': 'swing', 'name': 'Left arm', 'mask': [1, 1], 'pivot': list(SHOULDERS[1]), 'length': ARM,
     'gain': 1.3, 'wind': 1.65, 'hz': 0.67, 'damp': 0.4, 'max': 5.8},
    {'kind': 'wave', 'name': 'Coat flutter', 'mask': [1, 2], 'amount': 0.35, 'length': 270, 'speed': 56, 'dir': 62, 'gust': 3.5, 'vary': 0},
    {'kind': 'breathe', 'name': 'Breath', 'mask': [2, 0], 'amount': 0.9, 'dir': 270, 'period': 4.8},
    {'kind': 'parallax', 'name': 'Head', 'mask': [2, 1], 'amount': 3},
]
line = lambda v: json.dumps(v, separators=(',', ':'))
(img / 'makise-rig.js').write_text(
    '// The rig that brings img/makise.webp to life (see js/rig.js). Edit it in tools/rig.html.\n'
    f'Rig.add({{\n  "size": {line([W, H])},\n  "maps": {line(names)},\n  "effects": [\n'
    + ',\n'.join('    ' + line(e) for e in effects) + '\n  ]\n});\n', newline='\n')

for f in ['makise-rig.js', *names]:
    print(f'wrote img/{f} ({(img / f).stat().st_size // 1024} KB)')
