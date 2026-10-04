# Left-edge gear and schematic backdrop

Two changes to fill the empty left of the frame and stop the background reading as flat
black. Everything else stays as it is.

## 1. A bigger gear on the left edge

The bottom-left solid gear is the smallest of the three corner gears (radius about 343
design px, against 476 bottom right) and sits mostly below the frame, so only a small
corner of it shows. The strip left of Makise, from about y 450 to 1150, holds nothing
but the faint screentone patch.

- Grow it to about the size of the bottom-right gear: 48 teeth at pitch 64 (radius about
  505), centred near (-190, 1400) instead of (-70, 1500). Its rim then climbs the left
  edge to about y 930 and only reaches x 315 at the very bottom, where her coat has
  already faded out.
- Add a small solid gear, 16 teeth, meshing with it from above, centred just off the left
  edge near (-16, 770). It fills the empty band beside her hair (it reaches about x 165;
  her hair is at about x 430 there). The pair turn against each other on the existing beat.
- Same depth (1.0), drift and parallax as the gear has now. Neither gear may touch her
  figure above the fade, with the cursor at either extreme.
- The numbers are a starting point, tuned by eye on stills.

## 2. Schematic sheets in the background

Dim drafting sheets in the spirit of the opening's schematics, drawn in code like the
rest of the scene (the opening's frames are the show's artwork and can't ship).

**What's on a sheet:** compass circles and arcs, dial rings with ticks, gear trains in
outline, squares, diamonds and zig-zag constructions, long construction lines, rulers,
crosshairs and a few scribbled graphite smudges. Pen lines with a slight hand wobble,
some drawn over twice, on paper with faint grime.

**How it's laid in:** the Photoshop recipe, taken literally. The sheet (light paper,
dark lines) goes in with Lighten at low opacity. Where the scene is darker than the
dimmed paper, it's lifted to it, so the black becomes a dim warm paper. The lines stay
dark. Anything brighter (the clockwork, ink highlights, Makise, the digits) is untouched.

- It goes in first, as the paper the whole scene is drawn on. Over the flat black,
  Lighten is the same as laying the dim paper down, and everything else (clockwork, ink,
  backdrop, centrepiece) composes over it as it does over the black now. The pool of
  dark the scene keeps around the centrepiece dims it there. The vignette and the grunge
  border still darken the edges.
- **It changes gradually:** three sheets are baked once, tileable and larger than the
  frame. Each frame they're double-exposed: each one drifts its own slow way, slowly
  zooms and turns a few degrees, and fades in and out on long offset cycles (about a
  minute and a half). So one drawing slowly gives way to another, and the total amount
  of drawing stays about the same.
- **Parallax:** it's the deepest layer and drifts with the cursor, like the backdrop.
- **Strength:** a new slider, **Schematic strength** (0–100, 50 by default; 0 turns it
  off). At 50 the paper sits at about 14–18/255 over the black (tuned by eye): plainly
  there, but below the clockwork.
- **Performance:** the sheets are baked once, at about half the frame's resolution, and
  only again when the screen size changes. Each frame is one fill for the paper and one
  pattern fill per sheet. Target: under 1 ms more per frame at 1440p.

## Approaches considered

- **Drawn in code (chosen):** fits the rest of the wallpaper, sharp at any resolution,
  never repeats the same way twice, and nothing to license.
- **An image file**, such as a frame of the opening: most faithful, but it's the show's
  artwork, and a single picture can only drift, not change.
- **Faint extra copies of the clockwork:** cheap, but it reads as more of the same
  clockwork, not as drafting.

Light lines on the dark (the recipe inverted) were also considered. They'd read as more
clockwork, so the sheets keep dark lines on dim paper.

## Files

- New `wallpaper/js/schematic.js`: the sheets, baking and composing them.
- `wallpaper/js/scene.js`: the gears.
- `wallpaper/js/main.js`: building and drawing the sheets; `wallpaper/index.html`: the
  script tag.
- The new setting: `wallpaper/js/config.js`, `wallpaper/project.json`,
  `wallpaper/LivelyProperties.json`, `tools/preview.html`.
- Docs: `README.md` (settings, how it behaves, performance, code layout) and
  `workshop/WORKSHOP.md` (settings).

## Testing

- Stills at 1440p and 1080p at a few moments, to see the sheets change, and with the
  cursor at both extremes, to check the gears stay clear of her.
- The slider at 0, 50 and 100, and with both centrepieces.
- Frame cost from `SG.state().ms` before and after.
- `node tools/test.js` still passes, plus a check that the sheets' fades keep the total
  steady.

## Later, not in this change

- During a worldline shift the sheets could flicker and cut to a new arrangement, like
  the opening's quick cuts.
