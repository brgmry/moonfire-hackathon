# Avatars and Mac frame

Pixel-art assets for the README vs Reality UI. Everything here is generated: edit `gen.py`
and run `python3 gen.py` to rebuild every file. Open `preview.html` as a plain file to see them.

## mac.svg

ViewBox `0 0 400 480`, drawn on a 4px grid, flat fills, `shape-rendering="crispEdges"`.

The screen is the single element `<rect id="screen">`:

| | px (viewBox units) | fraction of the SVG |
|---|---|---|
| x | 72 | 0.1800 |
| y | 48 | 0.1000 |
| width | 256 | 0.6400 |
| height | 176 | 0.3667 |

To overlay HTML on the screen, give the frame's container `position: relative`, render
`mac.svg` at 100% width, and absolutely position the content at
`left: 18.0000%; top: 10.0000%; width: 64.0000%; height: 36.6667%`.
Screen aspect ratio is 256:176 (16:11). `preview.html` does exactly this.

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
| orchestrator | `#FFD23F` | gold, crown + clipboard |
| explorer | `#FF7A1A` | orange, wide-brim hat + magnifier |
| claims | `#3FA7FF` | blue, folded paper hat + scroll |
| compiler | `#9BE22E` | lime, hard hat + wrench |
| runner | `#FF4D4D` | red, headband + stride |
| classifier | `#B388FF` | purple, judge's wig + gavel |
| git | `#2EC4B6` | teal, top hat + book |
| writer | `#FF6BB5` | pink, beret + quill |

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
