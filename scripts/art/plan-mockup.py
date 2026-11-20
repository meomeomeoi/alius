#!/usr/bin/env python3
"""Top-down plan of the CCP outpost, irregular footprint, two floors and a roof (mock-up artboards, Design canvas
.dc.html). viewBox 0 0 1000 625 = the 16:10 hub stage. Rooms are data: (rect, kind, state, lit, label, doors)."""
import json
import math
import random
import sys

OUT = sys.argv[1]
W, H = 1000, 625
out = []
a = out.append


def col(c):
    return 'none' if c == 'none' else f'{{{{k.{c}}}}}'


def rect(x, y, w, h, cls='f', fill='furnFill', stroke='furn', extra=''):
    a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" class="{cls}" fill="{col(fill)}" stroke="{col(stroke)}"{extra}></rect>')


def line(x1, y1, x2, y2, cls='f', stroke='furn'):
    a(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" class="{cls}" stroke="{col(stroke)}"></line>')


def path(d, cls='f', fill='none', stroke='furn'):
    a(f'<path d="{d}" class="{cls}" fill="{col(fill)}" stroke="{col(stroke)}"></path>')


def circle(cx, cy, r, cls='f', fill='furnFill', stroke='furn', extra=''):
    a(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" class="{cls}" fill="{col(fill)}" stroke="{col(stroke)}"{extra}></circle>')


def text(x, y, s, cls, fill):
    a(f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" fill="{col(fill)}">{s}</text>')


# ================================================================== the plan as data
# corridor: (x, y, w, h). room: dict(label, r=(x,y,w,h), kind, state ('open'|'closed'|'sub'), lit, doors=[(x,y,side,size)], hub=bool)
F1_CORR = [
    (450, 230, 22, 150),   # the spine from the lobby north
    (300, 230, 400, 22),   # the cross corridor, out to the yard door
    (300, 140, 22, 90),    # the service corridor, a dead end with the back door
    (640, 252, 22, 128),   # the east corridor down to the workshop
    (560, 380, 290, 22),   # the south-east corridor and the covered walkway to the garage
]
F1 = [
    dict(label='LOBBY', r=(380, 380, 180, 90), kind='lobby', state='open', doors=[(460, 470, 's', 26)]),
    dict(label='DUTY', r=(380, 330, 70, 50), kind='office', state='closed', doors=[(450, 344, 'w', 12)], mini=True),
    dict(label='STAIRS', r=(384, 402, 46, 64), kind='stair', state='sub', note='↑ 2F'),
    dict(label='MESS HALL', r=(170, 300, 210, 150), kind='mess', state='open', hub=True, doors=[(380, 404, 'w', 20), (170, 400, 'w', 16)]),
    dict(label='KITCHEN', r=(190, 230, 110, 70), kind='kitchen', state='sub', doors=[(300, 234, 'e', 14), (230, 300, 's', 16)]),
    dict(label='STORAGE', r=(200, 140, 100, 90), kind='storage', state='closed', doors=[(300, 170, 'w', 14)]),
    dict(label='LAUNDRY', r=(322, 150, 108, 80), kind='laundry', state='closed', doors=[(322, 170, 'e', 14)]),
    dict(label='BACK STAIRS', r=(430, 160, 50, 70), kind='stair', state='sub', note='↑ 2F', doors=[(442, 230, 's', 14)]),
    dict(label='GYM', r=(480, 110, 160, 120), kind='gym', state='closed', doors=[(540, 230, 's', 16)]),
    dict(label='ARMORY', r=(380, 252, 70, 78), kind='armory', state='closed', doors=[(450, 270, 'w', 14)]),
    dict(label='MEDBAY', r=(472, 252, 168, 128), kind='medbay', state='open', hub=True, lit=True, doors=[(472, 270, 'e', 16), (640, 330, 'w', 16)]),
    dict(label='WORKSHOP', r=(662, 252, 140, 128), kind='workshop', state='open', hub=True, lit=True, doors=[(662, 300, 'e', 16), (740, 380, 's', 18)]),
    dict(label='LOCKERS', r=(560, 402, 120, 68), kind='lockers', state='closed', doors=[(600, 402, 's', 14)]),
    dict(label='GENERATOR', r=(680, 402, 90, 68), kind='generator', state='closed', doors=[(720, 402, 's', 14)]),
    dict(label='GARAGE', r=(850, 290, 110, 230), kind='garage', state='open', hub=True, doors=[(850, 384, 'w', 14)]),
]
F1_EXTRA_DOORS = [(700, 232, 'e', 18), (302, 140, 'n', 18)]  # cross corridor to the yard, the back door

F2_CORR = [
    (380, 380, 282, 22),   # K1: the landing corridor over the lobby, east to the stairwell bend
    (170, 380, 210, 22),   # K2: the west wing corridor, a dead end with a window
    (450, 252, 22, 128),   # K3: the spine, upstairs
    (300, 230, 362, 22),   # K4: the upper cross corridor
    (640, 252, 22, 150),   # K5: down the east side
    (300, 140, 22, 90),    # K6: the north-west dead end
    (662, 300, 140, 22),   # K7: the east stub past the commander's door, ending at a window
    (640, 402, 130, 22),   # K8: the south-east back corridor
]
F2 = [
    dict(label='STAIRS', r=(384, 402, 46, 64), kind='stair', state='sub', note='↓ 1F'),
    dict(label='BACK STAIRS', r=(430, 160, 50, 70), kind='stair', state='sub', note='↑ ROOF', doors=[(442, 230, 's', 14)]),
    # north-west, off the dead end
    dict(label='VACANT', r=(200, 140, 100, 45), kind='vacant', state='closed', doors=[(300, 150, 'w', 14)], cabin=True),
    dict(label='ANN', r=(200, 185, 100, 45), kind='cabin', state='open', lit=True, doors=[(300, 196, 'w', 14)], cabin=True),
    dict(label='VACANT', r=(322, 150, 54, 80), kind='vacant', state='closed', doors=[(322, 176, 'e', 14)], cabin=True),
    dict(label='LINEN', r=(376, 150, 54, 80), kind='storage', state='closed', doors=[(392, 230, 's', 14)], mini=True),
    # the west wing over the mess hall
    dict(label='VACANT', r=(170, 300, 70, 80), kind='vacant', state='closed', doors=[(190, 380, 'n', 14)], cabin=True),
    dict(label='CAT', r=(240, 300, 70, 80), kind='cabin', state='open', lit=True, doors=[(260, 380, 'n', 14)], cabin=True),
    dict(label='LIBRARY', r=(310, 300, 70, 80), kind='library', state='closed', doors=[(330, 380, 'n', 14)]),
    dict(label='SHOWERS', r=(170, 402, 210, 48), kind='showers', state='closed', doors=[(262, 402, 's', 14)]),
    # the centre
    dict(label='BRIEFING', r=(380, 252, 70, 128), kind='briefing', state='closed', doors=[(450, 300, 'w', 14)]),
    dict(label='DEE', r=(472, 252, 84, 64), kind='cabin', state='open', doors=[(472, 268, 'e', 14)], cabin=True),
    dict(label='VACANT', r=(472, 316, 84, 64), kind='vacant', state='closed', doors=[(472, 336, 'e', 14)], cabin=True),
    dict(label='COMMS', r=(556, 252, 84, 128), kind='comms', state='open', hub=True, lit=True, doors=[(590, 252, 'n', 16), (640, 330, 'w', 14)]),
    dict(label='LOOKOUT', r=(430, 402, 130, 68), kind='lookout', state='closed', doors=[(480, 402, 's', 14)]),
    dict(label='REC ROOM', r=(560, 402, 80, 68), kind='rec', state='closed', doors=[(640, 406, 'w', 14)]),
    dict(label='MOPS', r=(640, 424, 22, 46), kind='storage', state='closed', doors=[(645, 424, 's', 12)], mini=True),
    # the east: the commander's rooms past a stub, an office and a store beside it
    dict(label='OFFICE', r=(662, 252, 38, 48), kind='office', state='closed', doors=[(662, 266, 'e', 12)], mini=True),
    dict(label='STORE', r=(662, 322, 38, 58), kind='storage', state='closed', doors=[(662, 340, 'e', 12)], mini=True),
    dict(label='CMDR', r=(700, 252, 60, 48), kind='cmdr', state='open', lit=True, doors=[(712, 300, 'n', 14)], cmdr=True),
    dict(label='ARCHIVE', r=(760, 252, 42, 48), kind='storage', state='closed', doors=[(772, 300, 'n', 12)], mini=True),
    dict(label='MAP ROOM', r=(700, 322, 102, 58), kind='briefing2', state='closed', doors=[(740, 322, 's', 14)]),
    # the south-east back corridor
    dict(label='BEA', r=(662, 424, 54, 46), kind='cabin', state='open', doors=[(680, 424, 's', 14)], cabin=True),
    dict(label='VACANT', r=(716, 424, 54, 46), kind='vacant', state='closed', doors=[(734, 424, 's', 14)], cabin=True),
]
# the roof over the 2F (the hub's ROOF) and the lower roofs over the 1F-only parts
ROOF_HIGH = [(200, 140, 280, 90), (170, 300, 210, 150), (300, 230, 362, 22), (380, 252, 282, 218), (662, 252, 140, 128), (640, 380, 130, 90)]
ROOF_LOW = [(190, 230, 110, 70), (480, 110, 160, 120), (850, 290, 110, 230), (662, 230, 38, 22), (770, 380, 80, 22)]

YARD = (720, 40, 240, 190)
FENCE = (14, 14, 972, 597)

# ================================================================== site (always drawn)
rect(0, 0, W, H, 'none', 'outside', 'none')
rnd = random.Random(11)
a('<g class="cut-only">')
for _ in range(300):
    x, y = rnd.uniform(0, W), rnd.uniform(0, H)
    if 10 < x < 990 and 10 < y < 615:
        continue
    circle(x, y, rnd.uniform(0.4, 1.2), 'none', 'speck', 'none')
a('</g>')
rect(*FENCE, 'none', 'compound', 'none')
a('<g class="cut-only">')
for _ in range(260):
    x, y = rnd.uniform(20, 980), rnd.uniform(20, 605)
    circle(x, y, rnd.uniform(0.3, 0.8), 'none', 'speck', 'none', f' opacity="{rnd.uniform(0.25, 0.6):.2f}"')
a('</g>')
a('<g class="bp-only">')
for gx in range(0, W + 1, 25):
    line(gx, 0, gx, H, 'grid' + (' grid-major' if gx % 100 == 0 else ''), 'grid')
for gy in range(0, H + 1, 25):
    line(0, gy, W, gy, 'grid' + (' grid-major' if gy % 100 == 0 else ''), 'grid')
a('</g>')

# roads: from the gate to the main door, a branch east to the garage bay, a track north to the yard
rect(445, 470, 44, 141, 'road', 'road', 'none')
rect(445, 530, 515, 40, 'road', 'road', 'none')
rect(860, 520, 90, 10, 'road', 'road', 'none')
path('M 700 241 L 740 241 L 780 230', 'path')
for y in range(478, 605, 16):
    line(467, y, 467, y + 8, 'thin', 'roadLine')
for x in range(500, 950, 18):
    line(x, 550, x + 9, 550, 'thin', 'roadLine')
# lived-in outside: vegetable beds, a washing line, a bench under the water tower, fuel tanks, a burned-out wreck
for i in range(4):
    rect(40 + i * 28, 470, 22, 60, 'thin', 'bed', 'furn')
    for j in range(5):
        circle(51 + i * 28, 478 + j * 11, 2.2, 'none', 'leaf', 'none')
line(60, 350, 150, 330, 'thin dash')
for i in range(5):
    rect(70 + i * 16, 336 - i * 3.6, 6, 9, 'none', 'furn', 'none')
circle(90, 110, 26, 'f', 'furnFill', 'furn')                     # water tower
circle(90, 110, 18, 'thin', 'none', 'furn')
for ang in (45, 135, 225, 315):
    line(90 + 26 * math.cos(math.radians(ang)), 110 + 26 * math.sin(math.radians(ang)), 90 + 34 * math.cos(math.radians(ang)), 110 + 34 * math.sin(math.radians(ang)), 'f')
rect(128, 150, 30, 8, 'thin', 'furnFill', 'furn')                 # bench
for (cx, cy, r) in [(800, 455, 13), (826, 462, 11)]:              # fuel tanks by the generator
    circle(cx, cy, r, 'f', 'furnFill', 'furn')
    line(cx - r + 3, cy, cx + r - 3, cy, 'thin')
path('M 120 560 l 60 -10 l 8 26 l -60 10 Z M 140 556 l 4 24 M 162 552 l 4 24', 'thin dash')  # the wreck nobody moved
# the training yard
x, y, w, h = YARD
rect(x, y, w, h, 'wall-thin', 'yard', 'line')
path(f'M {x + 50} {y + 26} L {x + 140} {y + 26} A 30 30 0 0 1 {x + 140} {y + 86} L {x + 50} {y + 86} A 30 30 0 0 1 {x + 50} {y + 26} Z', 'f')
path(f'M {x + 50} {y + 36} L {x + 140} {y + 36} A 20 20 0 0 1 {x + 140} {y + 76} L {x + 50} {y + 76} A 20 20 0 0 1 {x + 50} {y + 36} Z', 'thin dash')
rect(x + 20, y + 106, 70, 70, 'f', 'furnFill', 'furn')
rect(x + 26, y + 112, 58, 58, 'thin', 'none', 'furn')
for i in range(4):
    tx = x + 120 + i * 30
    line(tx, y + 110, tx, y + 168, 'thin dash')
    rect(tx - 7, y + 172, 14, 4, 'f', 'furn', 'furn')
rect(x + 200, y + 26, 24, 50, 'thin', 'furnFill', 'furn')         # tyres and a sandbag pile
for i in range(3):
    circle(x + 212, y + 34 + i * 16, 6, 'thin', 'none', 'furn')
# fence, towers, the gate and the booth
fx, fy, fw, fh = FENCE
g0, g1 = 432, 502
for (x1, y1, x2, y2) in [(fx, fy, fx + fw, fy), (fx + fw, fy, fx + fw, fy + fh), (fx, fy, fx, fy + fh), (fx, fy + fh, g0, fy + fh), (g1, fy + fh, fx + fw, fy + fh)]:
    line(x1, y1, x2, y2, 'fence', 'fence')
    n = int(max(abs(x2 - x1), abs(y2 - y1)) // 20)
    for i in range(n + 1):
        px, py = x1 + (x2 - x1) * i / max(n, 1), y1 + (y2 - y1) * i / max(n, 1)
        rect(px - 1.5, py - 1.5, 3, 3, 'none', 'fence', 'none')
path(f'M {g0} {fy + fh} L {g0 + 33} {fy + fh - 10} M {g1} {fy + fh} L {g1 - 33} {fy + fh - 10}', 'f', 'none', 'fence')
rect(512, 584, 30, 22, 'wall-thin', 'room', 'line')
for (tx, ty) in [(fx, fy), (fx + fw, fy), (fx, fy + fh), (fx + fw, fy + fh)]:
    rect(tx - 14, ty - 14, 28, 28, 'wall', 'tower', 'line')
    line(tx - 9, ty - 9, tx + 9, ty + 9, 'thin', 'line')
    line(tx + 9, ty - 9, tx - 9, ty + 9, 'thin', 'line')
    dx, dy = (1 if tx < 500 else -1), (1 if ty < 300 else -1)
    a(f'<polygon points="{tx:.1f},{ty:.1f} {tx + dx * 150:.1f},{ty + dy * 60:.1f} {tx + dx * 60:.1f},{ty + dy * 150:.1f}" class="dusk-on cut-only" fill="{{{{k.glow}}}}" opacity="{{{{k.cone}}}}"></polygon>')
SITE = '\n'.join(out)


# ================================================================== furniture by kind (top view, relative to the room)
def furnish(kind, x, y, w, h, label):
    if kind == 'cabin':
        rect(x + 5, y + 5, w * 0.42, h * 0.62, 'f', 'furnFill', 'furn')
        rect(x + 7, y + 7, w * 0.42 - 4, h * 0.14, 'thin', 'bed', 'furn')
        rect(x + w - 15, y + 5, 10, h * 0.32, 'f', 'furnFill', 'furn')
        rect(x + w * 0.5, y + h - 18, w * 0.42, 9, 'f', 'furnFill', 'furn')
    elif kind == 'vacant':
        rect(x + 5, y + 5, w * 0.42, h * 0.62, 'thin', 'none', 'furn')
    elif kind == 'cmdr':
        rect(x + 4, y + 4, 20, h - 10, 'f', 'furnFill', 'furn')
        rect(x + 6, y + 6, 16, 8, 'thin', 'bed', 'furn')
        rect(x + w - 26, y + 4, 22, 12, 'f', 'furnFill', 'furn')
        rect(x + w - 21, y + 6, 12, 7, 'thin', 'screen', 'furn')
        circle(x + w - 15, y + 23, 4.5, 'f', 'furnFill', 'furn')
    elif kind == 'briefing2':
        rect(x + 20, y + 14, 62, 30, 'thin', 'none', 'furn')
        line(x + 24, y + 20, x + 78, y + 38, 'thin dash')
        line(x + 30, y + 40, x + 70, y + 18, 'thin dash')
        circle(x + 51, y + 29, 3, 'thin', 'none', 'accent')
    elif kind == 'mess':
        for ty in (y + 22, y + 72):
            rect(x + 40, ty, w - 70, 14, 'f', 'furnFill', 'furn')
            rect(x + 42, ty - 9, w - 74, 5, 'thin', 'furnFill', 'furn')
            rect(x + 42, ty + 18, w - 74, 5, 'thin', 'furnFill', 'furn')
        rect(x + 8, y + 8, 14, h - 40, 'f', 'furnFill', 'furn')
        for i in range(4):
            circle(x + 15, y + 20 + i * 24, 4.5, 'thin', 'none', 'furn')
    elif kind == 'kitchen':
        rect(x + 6, y + 6, w - 12, 14, 'f', 'furnFill', 'furn')
        for i in range(4):
            circle(x + 20 + i * 22, y + 13, 4.5, 'thin', 'none', 'furn')
        rect(x + 30, y + 34, 50, 16, 'f', 'furnFill', 'furn')
    elif kind == 'storage':
        n = max(1, min(3, int((h - 14) // 18)))
        pad = 10 if w > 60 else 5
        for i in range(n):
            rect(x + pad, y + 8 + i * (h - 22) / n, w - 2 * pad, 6 if w <= 60 else 9, 'thin', 'none', 'furn')
    elif kind == 'laundry':
        for i in range(3):
            rect(x + 10 + i * 26, y + 10, 22, 22, 'thin', 'none', 'furn')
            circle(x + 21 + i * 26, y + 21, 7, 'thin', 'none', 'furn')
        line(x + 10, y + 56, x + w - 10, y + 56, 'thin dash')
    elif kind == 'attic':
        for (cx, cy) in [(14, 12), (40, 18), (20, 44), (70, 30)]:
            rect(x + cx, y + cy, 20, 16, 'thin', 'none', 'furn')
    elif kind == 'stair':
        n = max(4, int(h // 7))
        for i in range(n):
            line(x + 4, y + 4 + i * (h - 8) / n, x + w - 4, y + 4 + i * (h - 8) / n, 'thin')
    elif kind == 'gym':
        rect(x + 14, y + 14, 60, 40, 'thin', 'none', 'furn')
        for i in range(3):
            rect(x + 90 + i * 20, y + 16, 12, 40, 'f', 'furnFill', 'furn')
        line(x + 20, y + 80, x + 130, y + 80, 'f')
        circle(x + 20, y + 80, 5, 'f', 'furnFill', 'furn')
        circle(x + 130, y + 80, 5, 'f', 'furnFill', 'furn')
    elif kind == 'armory':
        for i in range(3):
            line(x + 10, y + 14 + i * 18, x + w - 10, y + 14 + i * 18, 'f')
            for j in range(5):
                line(x + 14 + j * 10, y + 10 + i * 18, x + 14 + j * 10, y + 18 + i * 18, 'thin')
    elif kind == 'medbay':
        for bx in (x + 14, x + 70):
            rect(bx, y + 14, 26, 54, 'f', 'furnFill', 'furn')
            rect(bx + 3, y + 16, 20, 10, 'thin', 'bed', 'furn')
            path(f'M {bx - 6} {y + 8} q 10 4 0 14 q -10 10 0 20 q 10 8 0 20', 'thin dash')
        rect(x + w - 24, y + 14, 16, 40, 'f', 'furnFill', 'furn')
        circle(x + 54, y + 22, 2.4, 'thin', 'none', 'furn')
        rect(x + 20, y + h - 30, 60, 14, 'thin', 'furnFill', 'furn')
    elif kind == 'workshop':
        rect(x + 8, y + 8, w - 16, 16, 'f', 'furnFill', 'furn')
        for i in range(10):
            line(x + 14 + i * 11, y + 11, x + 14 + i * 11, y + 21, 'thin')
        rect(x + w - 54, y + 50, 44, 44, 'f', 'furnFill', 'furn')
        rect(x + w - 44, y + 60, 24, 24, 'thin', 'screen', 'furn')
        circle(x + w - 14, y + 56, 2.4, 'led', 'led', 'none')
        rect(x + 10, y + 50, 50, 26, 'f', 'furnFill', 'furn')
    elif kind == 'lockers':
        for i in range(8):
            rect(x + 8 + i * 13, y + 8, 11, 18, 'thin', 'none', 'furn')
        rect(x + 20, y + 40, 80, 8, 'thin', 'none', 'furn')
    elif kind == 'generator':
        rect(x + 12, y + 12, 50, 36, 'f', 'furnFill', 'furn')
        circle(x + 74, y + 22, 8, 'thin', 'none', 'furn')
    elif kind == 'garage':
        for vx in (x + 8, x + 58):
            rect(vx, y + 30, 44, 110, 'f', 'furnFill', 'furn')
            rect(vx + 5, y + 40, 34, 24, 'thin', 'screen', 'furn')
            rect(vx + 5, y + 74, 34, 56, 'thin', 'none', 'furn')
            for wy in (y + 42, y + 116):
                rect(vx - 4, wy, 4, 16, 'f', 'furn', 'furn')
                rect(vx + 44, wy, 4, 16, 'f', 'furn', 'furn')
        rect(x + 60, y + 170, 40, 30, 'f', 'furnFill', 'furn')
        a(f'<ellipse cx="{x + 30:.1f}" cy="{y + 182:.1f}" rx="22" ry="8" class="cut-only" fill="{{{{k.dim}}}}" opacity="0.18"></ellipse>')
        line(x + 6, y + h, x + w - 6, y + h, 'baydoor', 'accent')
    elif kind == 'lobby':
        rect(x + 110, y + 30, 56, 14, 'f', 'furnFill', 'furn')    # the duty desk
        circle(x + 138, y + 52, 5.5, 'f', 'furnFill', 'furn')
        rect(x + 110, y + 70, 56, 7, 'thin', 'furnFill', 'furn')  # bench
        rect(x + 76, y + 68, 32, 18, 'thin', 'rug', 'furn')       # the mat by the door
    elif kind == 'showers':
        for i in range(6):
            rect(x + 6 + i * 23, y + 6, 20, 24, 'thin', 'none', 'furn')
            circle(x + 16 + i * 23, y + 18, 3, 'thin', 'none', 'furn')
    elif kind == 'comms':
        for i in range(3):
            rect(x + w - 20, y + 8 + i * 30, 14, 26, 'f', 'furnFill', 'furn')
            circle(x + w - 13, y + 14 + i * 30, 1.8, 'led', 'led', 'none')
        rect(x + 8, y + 40, 30, 60, 'f', 'furnFill', 'furn')
        for i in range(3):
            rect(x + 10, y + 44 + i * 19, 8, 15, 'thin', 'screen', 'furn')
        circle(x + 48, y + 70, 7, 'f', 'furnFill', 'furn')
    elif kind == 'briefing':
        rect(x + 20, y + 30, 30, 70, 'thin', 'none', 'furn')
        for i in range(3):
            circle(x + 12, y + 42 + i * 22, 4, 'thin', 'none', 'furn')
            circle(x + 58, y + 42 + i * 22, 4, 'thin', 'none', 'furn')
        line(x + 15, y + h - 10, x + w - 15, y + h - 10, 'f')
    elif kind == 'library':
        for i in range(3):
            rect(x + 6, y + 8 + i * 18, w - 30, 6, 'thin', 'none', 'furn')
        circle(x + w - 14, y + h - 20, 6, 'f', 'furnFill', 'furn')
    elif kind == 'rec':
        rect(x + 10, y + 10, 34, 20, 'thin', 'none', 'furn')
        circle(x + 27, y + 20, 3, 'thin', 'none', 'furn')
        rect(x + 50, y + 8, 22, 40, 'thin', 'none', 'furn')
    elif kind == 'office':
        rect(x + 4, y + 6, w - 8, 12, 'thin', 'none', 'furn')
        circle(x + w / 2, y + 26, 4, 'thin', 'none', 'furn')
    elif kind == 'lookout':
        line(x + 8, y + h - 4, x + w - 8, y + h - 4, 'f', 'accent')
        for i in range(4):
            circle(x + 30 + i * 36, y + h - 18, 6, 'thin', 'none', 'furn')
        rect(x + 20, y + 10, 40, 20, 'thin', 'none', 'furn')


def door(x, y, side, size=16):
    if side in ('n', 's'):
        line(x, y, x + size, y, 'doorcut', 'corridor')
        sy = -1 if side == 'n' else 1
        path(f'M {x} {y} L {x} {y + sy * size} A {size} {size} 0 0 {0 if side == "n" else 1} {x + size} {y}', 'thin', 'none', 'furn')
    else:
        line(x, y, x, y + size, 'doorcut', 'corridor')
        sx = -1 if side == 'w' else 1
        path(f'M {x} {y} L {x + sx * size} {y} A {size} {size} 0 0 {1 if side == "w" else 0} {x} {y + size}', 'thin', 'none', 'furn')


def hatch(x, y, w, h, step=12):
    t = -h
    while t < w:
        x1, y1 = x + max(t, 0), y + (max(t, 0) - t)
        x2, y2 = x + min(t + h, w), y + (min(t + h, w) - t)
        line(x1, y1, x2, y2, 'hatch', 'line')
        t += step


def chip(x, y, label, closed=False, count=None):
    cw = len(label) * 5.6 + 12
    a(f'<rect x="{x:.1f}" y="{y:.1f}" width="{cw:.1f}" height="13" class="chip" fill="{col("chipClosed" if closed else "chip")}" stroke="{col("chipLine")}"></rect>')
    text(x + 6, y + 9.6, label, 'lab', 'chipTextClosed' if closed else 'chipText')
    if count:
        a(f'<rect x="{x + cw + 2:.1f}" y="{y:.1f}" width="13" height="13" class="chip" fill="{col("bg")}" stroke="{col("chipLine")}"></rect>')
        text(x + cw + 8.5, y + 9.6, str(count), 'lab mid', 'fg')


def marker(mx, my, letter, tone=''):
    stroke = {'hurt': 'danger', 'bond': 'bond'}.get(tone, 'fg')
    circle(mx, my, 10, 'marker', 'bg', stroke)
    text(mx, my + 3.4, letter, 'mk', 'fg')
    if tone:
        circle(mx + 8, my - 8, 5, 'none', stroke, 'none')
        text(mx + 8, my - 5.8, '!' if tone == 'hurt' else '♥', 'mk-tiny', 'bg')


def outline(rects):
    """Wall segments of the union of rects (integer units): edges between covered and uncovered cells, merged into runs."""
    cov = set()
    for (x, y, w, h) in rects:
        for cy in range(int(y), int(y + h)):
            for cx in range(int(x), int(x + w)):
                cov.add((cx, cy))
    xs = [c[0] for c in cov]; ys = [c[1] for c in cov]
    segs = []
    for yy in range(min(ys), max(ys) + 2):           # horizontal edges at y = yy
        run = None
        for xx in range(min(xs), max(xs) + 2):
            edge = ((xx, yy - 1) in cov) != ((xx, yy) in cov)
            if edge and run is None:
                run = xx
            if not edge and run is not None:
                segs.append((run, yy, xx, yy)); run = None
    for xx in range(min(xs), max(xs) + 2):           # vertical edges at x = xx
        run = None
        for yy in range(min(ys), max(ys) + 2):
            edge = ((xx - 1, yy) in cov) != ((xx, yy) in cov)
            if edge and run is None:
                run = yy
            if not edge and run is not None:
                segs.append((xx, run, xx, yy)); run = None
    return segs


def floor(corrs, rooms, extra_doors, markers, counts, caption):
    out.clear()
    opens = list(corrs) + [rm['r'] for rm in rooms if rm['kind'] == 'lobby' or (rm['kind'] == 'stair' and not rm.get('doors'))]
    for r in opens:
        rect(*r, 'none', 'corridor', 'none')
    for (x1, y1, x2, y2) in outline(opens):
        line(x1, y1, x2, y2, 'wall', 'line')
    for c in corrs:  # emergency lights along each corridor, night only
        x, y, w, h = c
        n = max(1, int(max(w, h) // 70))
        for i in range(n):
            t = (i + 0.5) / n
            if w > h:   # a lamp on the north wall, its glow a half-disc that falls into the corridor only
                ex, ey = x + w * t, y
                glow = f'M {ex - 7:.1f} {ey + 1.2:.1f} A 7 7 0 0 0 {ex + 7:.1f} {ey + 1.2:.1f} Z'
                dot = (ex, ey + 2)
            else:       # a lamp on the west wall
                ex, ey = x, y + h * t
                glow = f'M {ex + 1.2:.1f} {ey - 7:.1f} A 7 7 0 0 1 {ex + 1.2:.1f} {ey + 7:.1f} Z'
                dot = (ex + 2, ey)
            a(f'<path d="{glow}" class="night-on cut-only" fill="{{{{k.danger}}}}" opacity="0.16"></path>')
            a(f'<circle cx="{dot[0]:.1f}" cy="{dot[1]:.1f}" r="1.4" class="night-on elight" fill="{{{{k.danger}}}}"></circle>')
    for c in corrs:  # a dashed centre line along each corridor
        x, y, w, h = c
        if w > h:
            for cx in range(int(x) + 6, int(x + w) - 6, 16):
                line(cx, y + h / 2, cx + 7, y + h / 2, 'thin', 'corrLine')
        else:
            for cy in range(int(y) + 6, int(y + h) - 6, 16):
                line(x + w / 2, cy, x + w / 2, cy + 7, 'thin', 'corrLine')
    for rm in rooms:
        x, y, w, h = rm['r']
        if rm['kind'] == 'lobby' or (rm['kind'] == 'stair' and not rm.get('doors')):
            if rm['kind'] == 'stair':
                rect(x, y, w, h, 'thin', 'none', 'furn')
            furnish(rm['kind'], x, y, w, h, rm['label'])
            continue
        fill = 'closed' if rm['state'] == 'closed' else ('roomLit' if rm.get('lit') else ('corridor' if rm['kind'] in ('stair', 'lobby') else 'room'))
        rect(x, y, w, h, 'wall', fill, 'line')
        if rm.get('lit'):
            a(f'<ellipse cx="{x + w / 2:.1f}" cy="{y + h / 2:.1f}" rx="{w * 0.44:.1f}" ry="{h * 0.44:.1f}" class="dusk-on cut-only" fill="{{{{k.glow}}}}" opacity="{{{{k.glowA}}}}"></ellipse>')
            a(f'<ellipse cx="{x + w / 2:.1f}" cy="{y + h / 2:.1f}" rx="{w * 0.24:.1f}" ry="{h * 0.24:.1f}" class="dusk-on cut-only" fill="{{{{k.glow}}}}" opacity="{{{{k.glowB}}}}"></ellipse>')
        if rm['state'] == 'closed':
            hatch(x + 2, y + 2, w - 4, h - 4)
        furnish(rm['kind'], x, y, w, h, rm['label'])
    for rm in rooms:
        for d in rm.get('doors', []):
            door(*d)
    for d in extra_doors:
        door(*d)
    for rm in rooms:
        x, y, w, h = rm['r']
        if rm.get('cabin'):
            text(x + w / 2, y + h - 26 if rm['kind'] == 'vacant' else y + h - 24, rm['label'], 'lab-cabin mid', 'dim' if rm['kind'] == 'vacant' else 'fg')
        elif rm['kind'] == 'stair':
            text(x + w / 2, y + h / 2 + 3, rm['note'], 'lab-small mid stair-note', 'accent')
        elif rm.get('mini'):
            text(x + w / 2, y + h - 6, rm['label'], 'lab-mini mid', 'dim')
        elif rm.get('cmdr'):
            chip(x + 26, y + h - 17, 'CMDR')
            path(f'M {x + 30} {y + 22} h 8 v 7 h -8 Z M {x + 31.5} {y + 22} v -3 a 2.5 2.5 0 0 1 5 0 v 3', 'thin', 'none', 'accent')
        else:
            cx = x + 56 if rm['kind'] == 'lobby' else x + 5
            chip(cx, y + h - 18, rm['label'], rm['state'] == 'closed', counts.get(rm['label']))
    for m in markers:
        marker(*m)
    text(984, 620, caption, 'cap', 'dim')
    return '\n'.join(out)


FLOOR1 = floor(F1_CORR, F1, F1_EXTRA_DOORS, [(560, 300, 'D', 'hurt'), (740, 330, 'E', 'bond'), (260, 360, 'B'), (880, 120, 'F')],
               {'MEDBAY': 1, 'WORKSHOP': 1, 'MESS HALL': 1}, 'CCP OUTPOST · GROUND FLOOR · NOT TO SCALE')
# the yard chip and the outside labels go with the ground floor
out.clear()
chip(YARD[0] + 5, YARD[1] + YARD[3] - 18, 'TRAINING YARD', False, 1)
chip(22, 586, 'PERIMETER')
text(467, 600, 'GATE', 'lab-small mid', 'fenceText')
FLOOR1 += '\n' + '\n'.join(out)
# the 2F: the 1F roofs beside it are drawn low and dim
FLOOR2 = floor(F2_CORR, F2, [(770, 406, 'e', 14), (300, 233, 'w', 14)], [(276, 196, 'A'), (604, 330, 'C')], {'COMMS': 1},
               'CCP OUTPOST · UPPER FLOOR · NOT TO SCALE')
out.clear()
path('M 770 404 l 34 0 l 0 20 l -34 0', 'thin', 'none', 'line')   # the outside fire stair off the south-east corridor, down to the yard by the tanks
for i in range(6):
    line(774 + i * 5.4, 405, 774 + i * 5.4, 423, 'thin', 'furn')
text(787, 434, 'FIRE STAIR', 'lab-small mid', 'dim')
line(170, 385, 170, 397, 'doorcut', 'compound')                   # the window at the end of the west wing: glass in the wall
line(168.6, 385, 168.6, 397, 'thin', 'winLit')
line(171.4, 385, 171.4, 397, 'thin', 'winLit')
text(196, 268, 'OUT ▸ KITCHEN ROOF', 'lab-mini', 'dim')
FLOOR2 += '\n' + '\n'.join(out)

# ================================================================== the roof
out.clear()
for r in ROOF_LOW:
    rect(*r, 'wall-thin', 'roofLow', 'line')
for r in ROOF_HIGH:
    rect(*r, 'none', 'roofSlab', 'none')
cov_high = set()
for (x, y, w, h) in ROOF_HIGH:
    for cy in range(int(y), int(y + h)):
        for cx in range(int(x), int(x + w)):
            cov_high.add((cx, cy))
for (x1, y1, x2, y2) in outline(ROOF_HIGH):
    line(x1, y1, x2, y2, 'outer', 'line')
    # the parapet: the same edge moved 5 units toward the inside
    if y1 == y2:
        dy = 5 if (int((x1 + x2) / 2), y1) in cov_high else -5
        line(x1 + 5, y1 + dy, x2 - 5, y2 + dy, 'thin dash', 'line')
    else:
        dx = 5 if (x1, int((y1 + y2) / 2)) in cov_high else -5
        line(x1 + dx, y1 + 5, x2 + dx, y2 - 5, 'thin dash', 'line')
for (x, y, w, h) in [(850, 290, 110, 230), (480, 110, 160, 120)]:    # corrugated low roofs
    for i in range(1, 8):
        line(x + i * w / 8, y + 4, x + i * w / 8, y + h - 4, 'thin', 'line')
# the canopy over the hatch (the one in the roof backdrop), a rail along its edge
rect(380, 145, 100, 80, 'thin', 'canopy', 'line')
for i in range(1, 6):
    line(380 + i * 16.6, 145, 380 + i * 16.6, 225, 'thin', 'line')
line(206, 146, 474, 146, 'f', 'furn')
for px in range(210, 474, 14):
    line(px, 143, px, 149, 'thin')
rect(436, 172, 38, 32, 'f', 'corridor', 'accent')
text(455, 192, 'HATCH ↓', 'lab-small mid', 'accent')
# antenna over the comms, the dish, HVAC and vents, puddles, solar strip
rect(586, 300, 24, 24, 'f', 'furnFill', 'furn')
line(586, 300, 610, 324, 'thin')
line(610, 300, 586, 324, 'thin')
for gx, gy in [(540, 262), (650, 262), (540, 420), (650, 420)]:
    line(598, 312, gx, gy, 'thin dash')
circle(598, 312, 3, 'blink', 'warnLight', 'none')
path('M 520 300 a 26 26 0 1 1 0.1 0 Z', 'f', 'furnFill')
for (ux, uy) in [(220, 330), (290, 330), (730, 280)]:
    rect(ux, uy, 48, 38, 'f', 'furnFill', 'furn')
    circle(ux + 24, uy + 19, 13, 'thin', 'none', 'furn')
for i in range(5):
    rect(400 + i * 34, 420, 30, 36, 'thin', 'screen', 'furn')
a('<ellipse cx="300" cy="420" rx="40" ry="12" class="cut-only" fill="{{k.road}}" opacity="0.8"></ellipse>')
# the smoking spot: folding chair, crate, butts, by the parapet under the canopy
rect(398, 196, 12, 12, 'thin', 'furnFill', 'furn')
path('M 414 190 l 12 0 l 0 12 l -12 0 z', 'thin')
for i in range(5):
    circle(400 + i * 3, 214, 0.9, 'none', 'furn', 'none')
chip(186, 306, 'ROOF')
marker(420, 180, 'B')
text(984, 620, 'CCP OUTPOST · ROOFS · NOT TO SCALE', 'cap', 'dim')
ROOF = '\n'.join(out)

# ================================================================== alarm overlay
out.clear()
a('<g class="alarm-only">')
a(f'<rect x="{FENCE[0]}" y="{FENCE[1]}" width="{FENCE[2]}" height="{FENCE[3]}" class="alarm-frame pulse" fill="none" stroke="{{{{k.danger}}}}"></rect>')
a('<rect x="380" y="56" width="240" height="18" fill="{{k.danger}}" class="pulse"></rect>')
text(500, 68.5, 'ALARM // ALL HANDS', 'lab mid', 'bg')
a('</g>')
ALARM = '\n'.join(out)

TEMPLATE = open(sys.argv[2]).read()


def props(look, slot, palette, alarm, layer):
    return json.dumps({
        'look': {'editor': 'enum', 'options': ['plan', 'blueprint'], 'default': look},
        'slot': {'editor': 'enum', 'options': ['day', 'evening', 'night'], 'default': slot},
        'palette': {'editor': 'enum', 'options': ['amber', 'green', 'white'], 'default': palette},
        'layer': {'editor': 'enum', 'options': ['1f', '2f', 'roof'], 'default': layer},
        'alarm': {'editor': 'boolean', 'default': alarm},
        '$preview': {'width': 1280, 'height': 800},
    }, ensure_ascii=False)


VARIANTS = {
    'Main': ('Hub plan — ground floor, day', 'plan', 'day', 'amber', False, '1f'),
    'Night': ('Hub plan — upper floor, night', 'plan', 'night', 'amber', False, '2f'),
    'Roof': ('Hub plan — roofs, evening', 'plan', 'evening', 'amber', False, 'roof'),
    'Blueprint': ('Hub plan — blueprint, green palette', 'blueprint', 'day', 'green', False, '1f'),
}
for name, (title, look, slot, palette, alarm, layer) in VARIANTS.items():
    html = (TEMPLATE.replace('__TITLE__', title).replace('__SITE__', SITE).replace('__F1__', FLOOR1).replace('__F2__', FLOOR2)
            .replace('__ROOF__', ROOF).replace('__ALARM__SVG', ALARM)
            .replace('__PROPS__', props(look, slot, palette, alarm, layer)).replace('__LOOK__', look).replace('__SLOT__', slot)
            .replace('__PALETTE__', palette).replace('__LAYER__', layer).replace('__ALARM__', 'true' if alarm else 'false'))
    open(f'{OUT}/{name}.dc.html', 'w').write(html)
print(len(SITE), len(FLOOR1), len(FLOOR2), len(ROOF))
