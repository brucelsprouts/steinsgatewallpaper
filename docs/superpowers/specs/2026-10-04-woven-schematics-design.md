# Woven schematics

The third take on the schematics behind the scene (after the
[sheets](2026-10-04-left-gear-and-schematic-backdrop-design.md) and the
[figures](2026-10-04-schematics-in-motion-design.md)), from feedback on the figures:

- Too many separate circular figures popping up. It reads as random circles, not as
  intricate as the reference, and with them the right side feels cluttered.
- It should be woven together: long lines that span the screen and cross like a hash,
  with shapes hanging off those lines, as in the first reference image, using more lines
  than shapes.
- Dimmer, so it reads as a texture in the background rather than designs in front.
- The reference's dense middle shouldn't come with it.
- Also: the giant clocks look blurry.

The first build ruled every line upright, level or at 45°, and it read as one big grid.
The feedback on that:
- break some lines apart;
- don't bunch them up;
- set them at different angles;
- dim them a little;
- think of bismuth formations: straight and uniform, but they grow and form at different
  angles.

So the lines now grow like a crystal (below).

## Look

One connected drawing in faint light lines on the black, like the first reference
inverted, without its dense middle.

- **Lines first, grown like a crystal.** Straight lines in formations, each square to
  itself but set at its own angle to the others, so the drawing never reads as one grid.
  - A formation starts with a long line at an angle of its own, about a third of them
    right across the screen.
  - It grows off its lines:
    - runs at right angles to them, often stopping where they meet another line;
    - now and then a run at 60°, which starts a formation of its own;
    - steps: off a line and on beside it, once or twice, like a crystal's terraces;
    - three sides of a frame: out, along and back.
  - No formation holds more than a tenth of the drawing, so there are always many,
    at many angles.
- **Apart, and some broken.** No two lines running the same way lie closer than 45 px,
  and nothing is ruled twice. About a third of the long lines (over 350 px) have one to
  three gaps.
- **Shapes hang off the lines**, small and few:
  - small circles strung along a line;
  - rings (one to three, concentric) where two lines cross, sometimes with a dot;
  - a diamond at a crossing, its corners on the two lines (never one beside another);
  - crosshairs at a crossing;
  - ruler ticks along a stretch of a line;
  - hatching: a short run of parallel strokes along a line, like the reference's
    streaks;
  - compass arcs, centred on one crossing and passing through another;
  - short links from a line to the next line over;
  - a small ring or a dot where a line turns or sets off from another;
  - now and then a small dial at a crossing.
- **No figures on their own.** Orbits, constructions, nested squares, pendulums, rulers
  and worldlines go, and nothing floats free of the lines.
- **Dim.** In the open dark at 1440p, a line lifts the black by about 6 levels at the
  median and about 14 at the 90th percentile. That's about 40% dimmer than the first
  build. The whole stays below the deep clockwork, and every line has its own
  brightness.
- **Soft**, as before: drawn at about half a px per design px.
- **Even, with a clear middle.** New growths go where the drawing is barest, so nowhere
  piles up into a blob and nowhere is left bare for long. Shapes keep out of the core of
  the centrepiece, and a soft mask fades everything to nothing in the middle of it. The
  pool of dark the scene keeps there dims it further. The right third, where the
  clockwork is busiest, gets half as many shapes.

## Motion

It slowly grows and redraws itself, as if someone were drafting it.

- **A growth** is a run of lines drawn as one stroke, line after line, and the shapes
  on them.
- **Every few seconds** the oldest growth (a few minutes old) erases itself. Its shapes
  go first, then its lines one after another, each trimmed off from its start. A new
  growth is drawn where the drawing is barest, and its shapes appear as the pen passes
  them:
  - rings swept round as by a compass;
  - small circles popping in one after another;
  - ticks and hatching appearing along the line;
  - arcs swept with the compass arm showing.
- **What grows is chosen first**, so the drawing keeps its make-up over time:
  - a new formation, 22% of the time;
  - a run, 30%;
  - a step, 26%;
  - a frame, 22%.

  Where it goes is chosen second: of 24 tried, half aimed at the barest places from the
  nearest line, the one adding the most where the drawing wants it. A shape at a
  crossing goes when either of its lines does.
- **Glints:** now and then a faint glint runs along a line, sometimes turning onto
  another where they cross or meet.
- **Dials:** the few small dials tick round like the clocks.
- **No drift.** The drawing moves only with the cursor, as one deep plane like the
  backdrop, so its lines and shapes stay joined.
- **Worldline shift:** the drawing is wiped outward from the centrepiece in about a
  second. A new one then grows quickly, mostly redrawn within about five seconds.

## The giant clocks

They're blurred on purpose to look far away (1.4–1.6 design px of blur, baked at 80%
resolution). With crisp drafting lines behind them they read as out of focus. Sharpen
them:

- the half clock at the top: blur 0.35, full resolution;
- the astrolabe: blur 0.4, full resolution;
- the deep gear at the bottom right: blur 0.35, full resolution.

They keep their low opacity, so they still sit back. Behind them, the schematics are
now softer and dimmer than they are, so the depth reads the right way round.

## How it's drawn

- Settled lines and shapes are drawn once into a cached sheet at the layer's resolution,
  a little larger than the frame so the parallax never shows an edge.
- Each frame:
  1. the sheet is copied into the frame's layer;
  2. what is drawing on, erasing, ticking or glinting is drawn over it;
  3. the clear-middle mask is cut out;
  4. the layer is laid over the black with Screen, before anything else is drawn.
- The sheet is redrawn only when something starts to erase, every few seconds, in a
  handful of strokes batched by brightness and width. Something that finishes drawing on
  is added to the sheet as it is.
- Where lines cross is kept up to date as lines come and go, not worked out afresh.
- Target: under 1 ms a frame on average at 1440p, and a few ms for a sheet redraw.

## Settings

**Schematic strength** stays: 0–100, 50 as designed, 0 off. 50 is now the dimmer look.

## Approaches considered

- **Drawn in code (chosen):** sharp at any size, redraws itself, keeps the middle clear,
  and ships nothing from the show.
- **The reference frame itself as the overlay:** quickest and closest to that frame, but
  it's 1280×720 and motion-blurred, so it would look soft at full screen. It could only
  fade or drift, not draw itself, and it's the show's artwork.
- **The figures, joined up with lines:** a smaller change, but it would still read as
  separate figures.
- **One hash of lines across the screen (built first):** upright, level and diagonal
  lines, some ruled twice. It read as a grid, too uniform and bunched up, so the lines
  now grow in formations at their own angles.

## Files

- `wallpaper/js/schematic.js`: rewritten as the growing drawing.
- `wallpaper/js/scene.js`: the sharper clocks.
- `wallpaper/js/main.js`: the brightness, and passing the centrepiece's offset for the
  mask.
- Descriptions of the setting: `wallpaper/js/config.js` and `tools/preview.html`.
- Docs: `README.md` and `workshop/WORKSHOP.md`.

## Testing

- `node tools/test.js`:
  - lines draw on along their length, and their shapes start as the pen passes them;
  - every shape lies on its lines and goes when any of them goes;
  - it grows like a crystal: every growth sets off from a line, square to it or at 60°,
    and the lines lie at many angles, not a grid;
  - lines apart, some broken: none alongside another its way, and some long ones in
    pieces;
  - steady: the same number of growths, with something always drawing on or erasing;
  - even: no dense blob, seldom a bare patch, and no shapes in the clear middle;
  - few, small shapes: no gears, no diamonds side by side, at most a few dials, and
    more line than shape;
  - glints run only along lines and turn only at crossings;
  - a worldline shift wipes the drawing and grows a new one;
  - the sheet is redrawn only when something starts to erase, and nothing long gone is
    kept in memory.
- Stills:
  - at 1440p, 1080p and 4K, at several moments;
  - through a worldline shift;
  - at strength 0, 50 and 100;
  - with both centrepieces;
  - beside the reference.
- Frame cost before and after.
