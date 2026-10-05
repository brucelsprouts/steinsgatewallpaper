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

## Look

One connected drawing in faint light lines on the black: the first reference, inverted,
without its dense middle.

- **Lines first.** Long lines ruled right across the screen, or from one line to
  another, crossing like a hash. Mostly upright, then level, then 45° diagonals and a few
  shallow slants. About a third are ruled twice, side by side.
- **Shapes hang off the lines**, small and few:
  - small circles strung along a line;
  - rings (one to three, concentric) where two lines cross, sometimes with a dot;
  - a diamond at a crossing, its corners on the two lines (never one beside another);
  - crosshairs at a crossing;
  - ruler ticks along a stretch of a line;
  - hatching: a run of short parallel strokes along a line, like the reference's
    streaks;
  - compass arcs, centred on one crossing and passing through another;
  - short links from a line to the next line over;
  - now and then a small dial at a crossing.
- **No figures on their own.** Orbits, constructions, nested squares, pendulums, rulers
  and worldlines go, and nothing floats free of the lines.
- **Dim.** A single line sits about 6–12 levels over the black at 1440p, around a third
  as bright as the figures now. Doubled lines and crossings add a little more. Every
  line has its own brightness. The whole stays below the deep clockwork.
- **Soft**, as now: drawn at about half a px per design px.
- **Even, with a clear middle.** New lines and shapes go where the drawing is thinnest,
  so nowhere piles up into a blob and nowhere is left bare. Shapes keep out of the core
  of the centrepiece, and a soft mask fades everything to nothing in the middle of it.
  The pool of dark the scene keeps there dims it further. The right third, where the
  clockwork is busiest, gets fewer shapes and is mostly lines.

## Motion

It slowly redraws itself, as if someone were drafting it.

- **A cluster** is one line (ruled once or twice) and the shapes on it.
- **Every few seconds** the oldest cluster (a couple of minutes old) erases: its shapes
  first, then the line, trimmed off from one end. A new line is ruled across the screen
  over a few seconds, and its shapes grow on it as the pen passes them:
  - rings swept round as by a compass;
  - small circles popping in one after another;
  - ticks and hatching appearing along the line;
  - arcs swept with the compass arm showing.
- **Woven:** each new line goes where the drawing is thinnest. It often passes through
  an existing crossing, and when it's shorter than the screen it runs from one line to
  another. A shape at a crossing goes when either of its lines does.
- **Glints:** now and then a faint glint runs along a line, sometimes turning onto
  another line at a crossing.
- **Dials:** the few small dials tick round like the clocks.
- **No drift.** The drawing moves only with the cursor, as one deep plane like the
  backdrop, so its lines and shapes stay joined.
- **Worldline shift:** the drawing is wiped outward from the centrepiece in about a
  second. A new one is then ruled quickly, mostly redrawn within about five seconds.

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
  4. the layer is laid over the black with Screen, before anything else is drawn, as
     now.
- The sheet is redrawn only when something starts to erase, about every few seconds.
  It's batched by brightness and width into a handful of strokes. Something that
  finishes drawing on is added to the sheet as it is.
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

## Files

- `wallpaper/js/schematic.js`: rewritten as the woven drawing.
- `wallpaper/js/scene.js`: the sharper clocks.
- `wallpaper/js/main.js`: the brightness, and passing the centrepiece's offset for the
  mask.
- Descriptions of the setting: `wallpaper/js/config.js` and `tools/preview.html`.
- Docs: `README.md` and `workshop/WORKSHOP.md`.

## Testing

- `node tools/test.js`:
  - lines draw on along their length, and their shapes start as the pen passes them;
  - every shape lies on its lines and goes when any of them goes;
  - woven: each line crosses others, and the lines form one connected drawing;
  - steady: the same number of clusters, with something always drawing on or erasing;
  - even: no dense blob, no bare patch, and no shapes in the clear middle;
  - few, small shapes: no gears, no diamonds side by side, at most a few dials;
  - glints run only along lines and turn only at crossings;
  - a worldline shift wipes the drawing and draws a new one;
  - the sheet is redrawn only when something starts to erase.
- Stills:
  - at 1440p, 1080p and 4K, at several moments;
  - through a worldline shift;
  - at strength 0, 50 and 100;
  - with both centrepieces;
  - beside the reference.
- Frame cost before and after.
