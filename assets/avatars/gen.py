#!/usr/bin/env python3
"""Generate the README vs Reality avatar set, Mac frame, bubble, preview and README.

Run: python3 gen.py   (writes every file next to this script)

Sprite grids: one string per row. Characters:
  .  transparent
  #  black  (#111)
  w  white  (#fff)
  a  accent (one colour per role, overridable with CSS --accent)
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

BLACK = "#111"
WHITE = "#fff"

ROLES = {
    "orchestrator": ("#FFD23F", "gold, crown + clipboard"),
    "explorer": ("#FF7A1A", "orange, wide-brim hat + magnifier"),
    "claims": ("#3FA7FF", "blue, folded paper hat + scroll"),
    "compiler": ("#9BE22E", "lime, hard hat + wrench"),
    "runner": ("#FF4D4D", "red, headband + stride"),
    "classifier": ("#B388FF", "purple, judge's wig + gavel"),
    "git": ("#2EC4B6", "teal, top hat + book"),
    "writer": ("#FF6BB5", "pink, beret + quill"),
}

FRAMES = ("idle", "working", "found")

# ---------------------------------------------------------------- sprites

SPRITES = {}

SPRITES["explorer"] = {
    "idle": [
        "................",
        ".....######.....",
        ".....#aaaa#.....",
        ".....#aaaa#.....",
        ".#aaaaaaaaaaaa#.",
        "....#wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######.....",
        "....#aaaaaa#.aaa",
        "...#aaaaaaaa#awa",
        "...#aaaaaaaa#aaa",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        "................",
        ".....######.....",
        ".....#aaaa#.....",
        ".....#aaaa#.....",
        ".#aaaaaaaaaaaa#.",
        "....#wwwwww#....",
        "....#w#ww#w#aaa.",
        "....#wwwwww#awa.",
        "....#wwwwww#aaa.",
        ".....######..#..",
        "....#aaaaaa##...",
        "...#aaaaaaaa#...",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "found": [
        "aa..........aaa.",
        "aa...######.awa.",
        ".....#aaaa#.aaa.",
        "aa...#aaaa#..#..",
        ".#aaaaaaaaaaaa#.",
        "....#wwwwww#.#..",
        "....#w#ww#w#.#..",
        "....#wwwwww#.#..",
        "....#ww##ww#.#..",
        ".....######..#..",
        "....#aaaaaa#.#..",
        "...#aaaaaaaa##..",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["claims"] = {
    "idle": [
        ".......##.......",
        "......#aa#......",
        ".....#aaaa#.....",
        "....#aaaaaa#....",
        "....########....",
        "....#wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######..###",
        "....#aaaaaa#.#w#",
        "...#aaaaaaaa##w#",
        "...#aaaaaaaa##w#",
        "....########.###",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        ".......##.......",
        "......#aa#......",
        ".....#aaaa#.....",
        "....#aaaaaa#....",
        "....########....",
        "....#wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....#########..",
        "....#a#w####w#..",
        "...#aa#wwwwww#..",
        "...#aa#w####w#..",
        "....##########..",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "found": [
        "aa.....##....###",
        "aa....#aa#...#w#",
        ".....#aaaa#..#w#",
        "aa..#aaaaaa#.#w#",
        "....########.###",
        "....#wwwwww#.#..",
        "....#w#ww#w#.#..",
        "....#wwwwww#.#..",
        "....#ww##ww#.#..",
        ".....######..#..",
        "....#aaaaaa#.#..",
        "...#aaaaaaaa##..",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["compiler"] = {
    "idle": [
        "................",
        ".......##.......",
        ".....##aa##.....",
        "....#aaaaaa#....",
        "...##########...",
        "....#wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#.a.a",
        ".....######..aaa",
        "....#aaaaaa#..a.",
        "...#aaaaaaaa##a.",
        "...#aaaaaaaa#.a.",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        "................",
        ".......##.......",
        ".....##aa##.....",
        "....#aaaaaa#....",
        "...##########...",
        "....#wwwwww#.a.a",
        "....#w#ww#w#.aaa",
        "....#wwwwww#..a.",
        "....#wwwwww#..a.",
        ".....######...a.",
        "....#aaaaaa#..a.",
        "...#aaaaaaaa##a.",
        "...#aaaaaaaa#.a.",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "found": [
        "aa..............",
        "aa.....##....a.a",
        ".....##aa##..aaa",
        "aa..#aaaaaa#..a.",
        "...##########.a.",
        "....#wwwwww#..a.",
        "....#w#ww#w#..a.",
        "....#wwwwww#..a.",
        "....#ww##ww#..a.",
        ".....######...a.",
        "....#aaaaaa###a.",
        "...#aaaaaaaa#.a.",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["runner"] = {
    "idle": [
        "................",
        "................",
        "................",
        "................",
        ".....######.....",
        "..aa#aaaaaa#....",
        ".a..#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######.....",
        "....#aaaaaa#....",
        "...#aaaaaaaa#...",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        "................",
        "................",
        "................",
        "................",
        ".....######.....",
        "..aa#aaaaaa#....",
        ".a..#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######.....",
        ".a..#aaaaaa#....",
        "aa.#aaaaaaaa#...",
        ".a.#aaaaaaaa#...",
        "....########....",
        "....#w#..#w#....",
        "...###....###...",
    ],
    "found": [
        "aa..............",
        "aa..............",
        "................",
        "aa..............",
        ".....######.....",
        ".##.#aaaaaa#.##.",
        ".#..#w#ww#w#..#.",
        ".#..#wwwwww#..#.",
        ".#..#ww##ww#..#.",
        ".#...######...#.",
        ".#..#aaaaaa#..#.",
        "..##aaaaaaaa##..",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["classifier"] = {
    "idle": [
        "................",
        "................",
        "................",
        "...##########...",
        "..#wwwwwwwwww#..",
        "..#w#wwwwww#w#..",
        "..#w#w#ww#w#w#..",
        "..#w#wwwwww#w#..",
        "..#w#wwwwww#w#..",
        "..############..",
        "....#aaaaaa#.aaa",
        "...#aaaaaaaa#aaa",
        "...#aaaaaaaa##a.",
        "....########..a.",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        "................",
        ".............aaa",
        ".............aaa",
        "...##########.a.",
        "..#wwwwwwwwww#a.",
        "..#w#wwwwww#w#a.",
        "..#w#w#ww#w#w#a.",
        "..#w#wwwwww#w#a.",
        "..#w#wwwwww#w#a.",
        "..############a.",
        "....#aaaaaa###a.",
        "...#aaaaaaaa#.a.",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "found": [
        "aa..............",
        "aa..............",
        "................",
        "aa.##########...",
        "..#wwwwwwwwww#..",
        "..#w#wwwwww#w#..",
        "..#w#w#ww#w#w#..",
        "..#w#wwwwww#w#..",
        "..#w#ww##ww#w#..",
        "..############..",
        "....#aaaaaa###..",
        "...#aaaaaaaa#.a.",
        "...#aaaaaaaa#aaa",
        "....########.aaa",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["git"] = {
    "idle": [
        "....########....",
        "....#aaaaaa#....",
        "....#aaaaaa#....",
        "....#aaaaaa#....",
        "..############..",
        "....#wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######.####",
        "....#aaaaaa##aw#",
        "...#aaaaaaaa#aw#",
        "...#aaaaaaaa####",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        "....########....",
        "....#aaaaaa#....",
        "....#aaaaaa#....",
        "....#aaaaaa#....",
        "..############..",
        "....#wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######.....",
        "...##########...",
        "...#wwwwaaww#...",
        "...#wwwwaaww#...",
        "...#wwwwaaww#...",
        "...##########...",
        ".....##..##.....",
    ],
    "found": [
        "aa..########....",
        "aa..#aaaaaa#....",
        "....#aaaaaa#....",
        "aa..#aaaaaa#....",
        "..############..",
        "....#wwwwww#.###",
        "....#w#ww#w#.#a#",
        "....#wwwwww#.#a#",
        "....#ww##ww#.###",
        ".....######..#..",
        "....#aaaaaa##...",
        "...#aaaaaaaa#...",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["writer"] = {
    "idle": [
        "..............aa",
        ".............aa.",
        ".......#....aa..",
        "...#########.a..",
        "..#aaaaaaaaa##..",
        "..###wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#....",
        "....#wwwwww#....",
        ".....######.....",
        "....#aaaaaa#....",
        "...#aaaaaaaa#...",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
    "working": [
        "................",
        "................",
        ".......#........",
        "...#########....",
        "..#aaaaaaaaa##..",
        "..###wwwwww#....",
        "....#w#ww#w#....",
        "....#wwwwww#..aa",
        "....#wwwwww#.aa.",
        ".....######.aa..",
        "....#aaaaaa###..",
        "...#aaaaaaaa##..",
        "...#aaaaaaaa####",
        "....########.#w#",
        ".....#w##w#..#w#",
        ".....##..##..###",
    ],
    "found": [
        "aa............aa",
        "aa...........aa.",
        ".......#.....aa.",
        "aa.#########.##.",
        "..#aaaaaaaaa##..",
        "..###wwwwww#.#..",
        "....#w#ww#w#.#..",
        "....#wwwwww#.#..",
        "....#ww##ww#.#..",
        ".....######..#..",
        "....#aaaaaa#.#..",
        "...#aaaaaaaa##..",
        "...#aaaaaaaa#...",
        "....########....",
        ".....#w##w#.....",
        ".....##..##.....",
    ],
}

SPRITES["orchestrator"] = {
    "idle": [
        "........................",
        "......#.....#.....#.....",
        ".....#a#...#a#...#a#....",
        ".....#aa#.#aaa#.#aa#....",
        ".....#aaaaaaaaaaaaa#....",
        ".....#aaaaaaaaaaaaa#....",
        ".....###############....",
        "......#wwwwwwwwww#......",
        "......#wwwwwwwwww#......",
        "......#ww##ww##ww#......",
        "......#ww##ww##ww#......",
        "......#wwwwwwwwww#......",
        "......#wwwwwwwwww#......",
        ".......##########.aaa...",
        "......#aaaaaaaaa#######.",
        ".....#aaaaaaaaaa#aw##w#.",
        ".....#aaaaaaaaaa#wwwww#.",
        ".....#aaaaaaaaaa#aw##w#.",
        ".....#aaaaaaaaaa#wwwww#.",
        "......#################.",
        ".......#ww#..#ww#.......",
        ".......#ww#..#ww#.......",
        ".......####..####.......",
        "........................",
    ],
    "working": [
        "........................",
        "......#.....#.....#.....",
        ".....#a#...#a#...#a#....",
        ".....#aa#.#aaa#.#aa#....",
        ".....#aaaaaaaaaaaaa#....",
        ".....#aaaaaaaaaaaaa#....",
        ".....###############....",
        "......#wwwwwwwwww#......",
        "......#wwwwwwwwww#......",
        "......#ww##ww##ww#......",
        "......#ww##ww##ww#......",
        "......#wwwwwwwwww#......",
        "......#wwwwwwwwww#......",
        ".......##########.aaa...",
        "......#aaaaaaaaa#######.",
        ".#####aaaaaaaaaa#aw##w#.",
        ".#ww##aaaaaaaaaa#wwwww#.",
        ".#####aaaaaaaaaa#aw##w#.",
        ".....#aaaaaaaaaa#wwwww#.",
        "......#################.",
        ".......#ww#..#ww#.......",
        ".......#ww#..#ww#.......",
        ".......####..####.......",
        "........................",
    ],
    "found": [
        "aa......................",
        "aa....#.....#.....#.....",
        "aa...#a#...#a#...#a#....",
        ".....#aa#.#aaa#.#aa#....",
        "aa...#aaaaaaaaaaaaa#....",
        ".....#aaaaaaaaaaaaa#....",
        ".....###############aa..",
        "......#wwwwwwwwww#######",
        "......#wwwwwwwwww#aw##w#",
        "......#ww##ww##ww#wwwww#",
        "......#ww##ww##ww#aw##w#",
        "......#wwwwwwwwww#wwwww#",
        "......#www####www#######",
        ".......##########.#.....",
        "......#aaaaaaaaaa##.....",
        ".....#aaaaaaaaaaaa#.....",
        ".....#aaaaaaaaaaaa#.....",
        ".....#aaaaaaaaaaaa#.....",
        ".....#aaaaaaaaaaaa#.....",
        "......############......",
        ".......#ww#..#ww#.......",
        ".......#ww#..#ww#.......",
        ".......####..####.......",
        "........................",
    ],
}

# Speech bubble, 24 x 20, tail bottom-left. 9-slice: left 8, right 3, top 3, bottom 8.
BUBBLE = [
    ".######################.",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    "#wwwwwwwwwwwwwwwwwwwwww#",
    ".###wwww###############.",
    "...#www#................",
    "..#www#.................",
    ".#ww#...................",
    "####....................",
]


# ---------------------------------------------------------------- helpers

def validate(name, grid, size):
    assert len(grid) == size, f"{name}: {len(grid)} rows, want {size}"
    for i, row in enumerate(grid):
        assert len(row) == size, f"{name} row {i}: {len(row)} chars, want {size}: {row!r}"
        bad = set(row) - set(".#wa")
        assert not bad, f"{name} row {i}: bad chars {bad}"


def runs(grid, ch):
    """Yield (x, y, width) for horizontal runs of ch."""
    for y, row in enumerate(grid):
        x = 0
        while x < len(row):
            if row[x] == ch:
                start = x
                while x < len(row) and row[x] == ch:
                    x += 1
                yield start, y, x - start
            else:
                x += 1


def rects(grid, ch, indent="    "):
    return "\n".join(
        f'{indent}<rect x="{x}" y="{y}" width="{w}" height="1"/>' for x, y, w in runs(grid, ch)
    )


def sprite_svg(grid, accent, title, size):
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" '
        f'width="{size}" height="{size}" shape-rendering="crispEdges">',
        f"  <title>{title}</title>",
    ]
    black = rects(grid, "#")
    white = rects(grid, "w")
    acc = rects(grid, "a")
    if black:
        parts += [f'  <g fill="{BLACK}">', black, "  </g>"]
    if white:
        parts += [f'  <g fill="{WHITE}">', white, "  </g>"]
    if acc:
        parts += [f'  <g class="accent" fill="var(--accent, {accent})">', acc, "  </g>"]
    parts.append("</svg>\n")
    return "\n".join(parts)


def write(name, text):
    with open(os.path.join(HERE, name), "w") as fh:
        fh.write(text)


# ---------------------------------------------------------------- mac

U = 4  # one pixel unit = 4 svg px; canvas 100 x 120 units = 400 x 480
BEIGE = "#E8DCC4"
BEIGE_DARK = "#CDBE9F"
BEZEL = "#3A3A3A"
SLOT = "#6A6A6A"
SCREEN_FILL = "#2B2B2B"

# screen rect in units
SCREEN_U = (18, 12, 64, 44)
SCREEN_PX = tuple(v * U for v in SCREEN_U)


def mac_svg():
    r = []

    def rect(x, y, w, h, fill, extra=""):
        r.append(
            f'  <rect x="{x*U}" y="{y*U}" width="{w*U}" height="{h*U}" fill="{fill}"{extra}/>'
        )

    # body outline, pixel-rounded corners
    rect(10, 3, 80, 1, BLACK)
    rect(10, 107, 80, 1, BLACK)
    rect(9, 4, 1, 103, BLACK)
    rect(90, 4, 1, 103, BLACK)
    rect(10, 4, 80, 103, BEIGE)
    # bevel shading: right edge and bottom edge
    rect(88, 5, 2, 102, BEIGE_DARK)
    rect(11, 104, 79, 3, BEIGE_DARK)
    # handle recess on top
    rect(38, 4, 24, 1, BLACK)
    rect(39, 5, 22, 1, BEIGE_DARK)
    # bezel outline (pixel-rounded) and fill
    rect(16, 9, 68, 1, BLACK)
    rect(16, 59, 68, 1, BLACK)
    rect(15, 10, 1, 49, BLACK)
    rect(84, 10, 1, 49, BLACK)
    rect(16, 10, 68, 49, BEZEL)
    # the screen: a single rect with id="screen"
    sx, sy, sw, sh = SCREEN_U
    rect(sx, sy, sw, sh, SCREEN_FILL, ' id="screen"')
    # badge: plain rectangle, no logo
    rect(18, 63, 10, 3, BLACK)
    rect(19, 64, 8, 1, BEIGE_DARK)
    # floppy slot
    rect(54, 65, 28, 4, BLACK)
    rect(55, 66, 26, 2, SLOT)
    # groove between face and base
    rect(10, 74, 80, 1, BEIGE_DARK)
    rect(10, 75, 80, 1, BLACK)
    # recessed base vent
    rect(18, 96, 64, 1, BLACK)
    rect(18, 97, 64, 3, BEIGE_DARK)
    rect(18, 100, 64, 1, BLACK)

    return "\n".join(
        [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 480" width="400" height="480" '
            'shape-rendering="crispEdges">',
            "  <title>Compact Macintosh frame</title>",
            *r,
            "</svg>\n",
        ]
    )


# ---------------------------------------------------------------- bubble

def bubble_svg():
    w, h = len(BUBBLE[0]), len(BUBBLE)
    for row in BUBBLE:
        assert len(row) == w, row
    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
            'shape-rendering="crispEdges">',
            "  <title>Speech bubble, tail bottom-left</title>",
            f'  <g fill="{BLACK}">',
            rects(BUBBLE, "#"),
            "  </g>",
            f'  <g fill="{WHITE}">',
            rects(BUBBLE, "w"),
            "  </g>",
            "</svg>\n",
        ]
    )


# ---------------------------------------------------------------- preview

def preview_html():
    sx, sy, sw, sh = SCREEN_PX
    left, top = sx / 400 * 100, sy / 480 * 100
    width, height = sw / 400 * 100, sh / 480 * 100

    css_anim = []
    for role in ROLES:
        css_anim.append(
            f".anim-{role} {{ animation: cyc-{role} 0.75s step-end infinite; }}\n"
            f"@keyframes cyc-{role} {{\n"
            f"  0%   {{ background-image: url({role}_idle.svg); }}\n"
            f"  33.4% {{ background-image: url({role}_working.svg); }}\n"
            f"  66.7% {{ background-image: url({role}_found.svg); }}\n"
            f"}}"
        )

    cards = []
    for role, (accent, _) in ROLES.items():
        for frame in FRAMES:
            imgs = "".join(
                f'<img src="{role}_{frame}.svg" width="{s}" height="{s}" alt="">' for s in (16, 32, 64)
            )
            cards.append(
                f'<div class="card"><div class="imgs">{imgs}</div>'
                f'<div class="label">{role} <span>{frame}</span></div></div>'
            )

    anim_row = "".join(
        f'<div class="card"><div class="sprite anim-{role}"></div><div class="label">{role}</div></div>'
        for role in ROLES
    )

    # inline explorer for the recolour demo
    explorer_inline = sprite_svg(SPRITES["explorer"]["idle"], ROLES["explorer"][0], "explorer", 16)
    explorer_inline = explorer_inline.replace(' width="16" height="16"', ' width="64" height="64"')
    recolour = "".join(
        f'<div class="card"><div style="--accent:{c}">{explorer_inline}</div>'
        f'<div class="label">--accent: {c}</div></div>'
        for c in ("#FF7A1A", "#00E5FF", "#FFFFFF")
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Avatar preview</title>
<style>
  body {{ margin: 0; padding: 24px 16px; background: #15161a; color: #ddd;
         font: 13px/1.4 ui-monospace, Menlo, monospace; }}
  h1, h2 {{ font-weight: normal; font-size: 14px; letter-spacing: .08em; text-transform: uppercase;
            color: #888; margin: 32px 0 12px; }}
  h1 {{ margin-top: 0; }}
  .mac {{ position: relative; width: 400px; max-width: 100%; }}
  .mac img {{ display: block; width: 100%; height: auto; }}
  .mac .overlay {{ position: absolute; left: {left:.4f}%; top: {top:.4f}%;
                   width: {width:.4f}%; height: {height:.4f}%;
                   background: #0d1b2a; outline: 1px solid #00e5ff; box-sizing: border-box;
                   display: grid; grid-template-columns: 2fr 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 2px; padding: 2px; }}
  .overlay div {{ background: #1b3350; }}
  .overlay div:nth-child(2) {{ background: #24445f; }}
  .overlay div:nth-child(4) {{ background: #2d5470; grid-column: span 2; }}
  .overlay img {{ position: absolute; width: 24px; height: 24px; }}
  .grid {{ display: flex; flex-wrap: wrap; gap: 12px; }}
  .card {{ background: #1e2026; border: 1px solid #2c2f38; padding: 10px; min-width: 150px; }}
  .imgs {{ display: flex; align-items: flex-end; gap: 10px; height: 64px; }}
  .imgs img {{ image-rendering: pixelated; }}
  .label {{ margin-top: 8px; color: #aaa; }}
  .label span {{ color: #666; }}
  .sprite {{ width: 64px; height: 64px; background-size: 64px 64px; background-repeat: no-repeat; }}
  .light {{ background: #e9e9e9; }}
  .light .card {{ background: #f6f6f6; border-color: #ccc; }}
  .light .label {{ color: #444; }}
{chr(10).join(css_anim)}
</style>
</head>
<body>
<h1>mac.svg with the screen rect overlaid ({sx}, {sy}, {sw} x {sh})</h1>
<div class="mac">
  <img src="mac.svg" alt="Macintosh frame">
  <div class="overlay">
    <div></div><div></div><div></div><div></div>
    <img src="explorer_working.svg" style="left:12%;top:18%" alt="">
    <img src="explorer_found.svg" style="left:40%;top:30%" alt="">
    <img src="compiler_working.svg" style="left:70%;top:12%" alt="">
    <img src="orchestrator_idle.svg" style="left:62%;top:55%;width:36px;height:36px" alt="">
    <img src="claims_idle.svg" style="left:22%;top:62%" alt="">
  </div>
</div>

<h2>Animated, 4 frames per second (idle, working, found)</h2>
<div class="grid">{anim_row}</div>

<h2>Every frame at 16, 32 and 64 px</h2>
<div class="grid">{"".join(cards)}</div>

<h2>Recolour via --accent (inline SVG, explorer idle)</h2>
<div class="grid">{recolour}</div>

<h2>On a light treemap</h2>
<div class="grid light">{"".join(f'<div class="card"><div class="imgs"><img src="{r}_idle.svg" width="32" height="32" alt=""><img src="{r}_found.svg" width="32" height="32" alt=""></div><div class="label">{r}</div></div>' for r in ROLES)}</div>

<h2>Speech bubble</h2>
<div class="grid">
  <div class="card"><img src="bubble.svg" width="96" height="80" alt=""><div class="label">bubble.svg at 4x</div></div>
  <div class="card"><div style="width:220px;padding:10px 12px 26px 14px;border-style:solid;border-width:3px 3px 8px 8px;border-image:url(bubble.svg) 3 3 8 8 fill;color:#111;image-rendering:pixelated">README says 'npm test', there is no test script.</div><div class="label">9-slice via border-image</div></div>
</div>
</body>
</html>
"""


# ---------------------------------------------------------------- readme

def readme():
    sx, sy, sw, sh = SCREEN_PX
    rows = "\n".join(f"| {role} | `{acc}` | {desc} |" for role, (acc, desc) in ROLES.items())
    return f"""# Avatars and Mac frame

Pixel-art assets for the README vs Reality UI. Everything here is generated: edit `gen.py`
and run `python3 gen.py` to rebuild every file. Open `preview.html` as a plain file to see them.

## mac.svg

ViewBox `0 0 400 480`, drawn on a 4px grid, flat fills, `shape-rendering="crispEdges"`.

The screen is the single element `<rect id="screen">`:

| | px (viewBox units) | fraction of the SVG |
|---|---|---|
| x | {sx} | {sx/400:.4f} |
| y | {sy} | {sy/480:.4f} |
| width | {sw} | {sw/400:.4f} |
| height | {sh} | {sh/480:.4f} |

To overlay HTML on the screen, give the frame's container `position: relative`, render
`mac.svg` at 100% width, and absolutely position the content at
`left: {sx/400*100:.4f}%; top: {sy/480*100:.4f}%; width: {sw/400*100:.4f}%; height: {sh/480*100:.4f}%`.
Screen aspect ratio is {sw}:{sh} (16:11). `preview.html` does exactly this.

Colours: body `#E8DCC4`, shade `#CDBE9F`, bezel `#3A3A3A`, screen fill `#2B2B2B` (hidden
once content is overlaid), outlines `#111`. The badge under the screen is a plain rectangle.

## Avatars

Files: `<role>_<frame>.svg`, frames `idle`, `working`, `found`. 16x16 grid, viewBox
`0 0 16 16`, except `orchestrator_*.svg`, which is 24x24 (viewBox `0 0 24 24`) and should be
rendered at 1.5x the size of the others. Three fills only: black `#111`, white `#fff`,
and one accent per role. Horizontal runs of same-coloured pixels are merged into one
`<rect>`; nothing else is optimised.

| role | accent | signature |
|---|---|---|
{rows}

Every `found` frame has the same tells: an accent `!` in the top-left corner and an open
mouth, so a finding reads the same for any role.

### Recolouring

All accent pixels of an avatar sit in one group:
`<g class="accent" fill="var(--accent, #FF7A1A)">`. Set `--accent` on an ancestor to override
it. This only works when the SVG is inline in the DOM (or injected via JS); an `<img>` tag
cannot see page CSS variables and shows the fallback.

### Animation

Cycle the three frames at 4 fps (250ms per frame). `preview.html` does it with a
`step-end` keyframe animation on `background-image`.

## bubble.svg

24x20 speech bubble, white fill, 1px black border, tail bottom-left. 9-slice with
`border-image: url(bubble.svg) 3 3 8 8 fill` (top, right, bottom, left) so the tail stays in the
bottom-left corner cell while the body stretches. Scale with `border-width` (3px/8px at 1x,
6px/16px at 2x), and set `image-rendering: pixelated` on the element.
"""


# ---------------------------------------------------------------- main

def main():
    for role, frames in SPRITES.items():
        size = 24 if role == "orchestrator" else 16
        accent = ROLES[role][0]
        for frame in FRAMES:
            grid = frames[frame]
            validate(f"{role}/{frame}", grid, size)
            write(f"{role}_{frame}.svg", sprite_svg(grid, accent, f"{role} {frame}", size))
    write("mac.svg", mac_svg())
    write("bubble.svg", bubble_svg())
    write("preview.html", preview_html())
    write("README.md", readme())
    print("wrote", 3 * len(SPRITES) + 4, "files to", HERE)


if __name__ == "__main__":
    main()
