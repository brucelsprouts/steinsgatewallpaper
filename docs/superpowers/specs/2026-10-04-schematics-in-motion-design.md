# Schematics in motion

A rework of the schematics behind the scene
([first version](2026-10-04-left-gear-and-schematic-backdrop-design.md)), from feedback on
how it looked:

- The paper lift made the original content (clockwork, Makise) harder to see. The lines
  should be the bright part instead, or the paper much dimmer.
- It moved like one page of shapes sliding across the screen. Each shape should move in
  its own way, more like motion graphics.
- Overlapping sheets made some areas very dense and others empty.
- No gears (the opening doesn't have them), and no row of diamonds side by side.
- There could be more shapes.

## Look

Inverted: faint light lines (a pale warm white) on the black, laid over it with Screen
before everything else is drawn. Nothing lifts the black, so the clockwork and Makise keep
their full contrast. The pool of dark around the centrepiece still dims the lines there.
They're drawn at half the frame's resolution, so they're soft and stay behind the
clockwork. **Schematic strength** (0–100, 50 as designed, 0 off) scales their brightness.

## Shapes

Kept from the first version: dials, compass constructions (a polygon in its circle, with
its diagonals), nested squares, rulers, pendulum wedges, crosshairs and long construction
lines. Removed: gear trains, rows of diamonds and graphite scribbles (inverted, they'd
read as glowing fuzz). Added: dashed orbits, and branching worldlines (a line that splits
into branches as it's drawn, which fits Steins;Gate).

## Motion

Built from the line toolkit of motion graphics: trim paths (a stroke drawing itself on,
travelling as a segment, erasing itself), stagger (parts one after another), repeaters
revealed (rings of ticks), marching dashes and counter-rotating rings.

- **Each figure has a life:** it draws itself on over a few seconds, its parts staggered;
  stays about a minute; then erases itself. Every few seconds the longest-staying one
  erases itself while another draws itself on in the emptiest free spot, so something is
  always drawing on or erasing.
- **Each moves its own way while it lives:**
  - dials: a tick ring ticking round a tick at a time (like the clocks), an inner ring
    turning the other way, a hand sweeping;
  - orbits: dashes marching opposite ways, a segment travelling round with a dot at its
    head;
  - constructions: the polygon turning inside its circle;
  - nested squares: each swinging on its own, slipping out of line and back;
  - pendulums: rod, bob and wedges swinging;
  - rulers: the scale sliding, an index moving to and fro;
  - crosshairs: popping in, snapping round an eighth of a turn now and then;
  - worldlines: drawn on from one end, branching as they go, with a pulse running along.
- **Each has its own depth** (its own parallax with the cursor) **and its own slow
  drift**, and turns a few degrees over its life. Deeper figures are fainter.
- **A worldline shift** erases everything quickly and draws a fresh set elsewhere, like
  the opening's quick cuts.

## Spacing

One layer of figures, not overlapping sheets. About two dozen figures and 3 long
construction lines at a time. A new figure goes where it's farthest from the others
(allowing for their sizes) and from the middle of the centrepiece. So no patch piles up
and none stays bare.

## Testing

- In `tools/test.js`:
  - the count stays steady;
  - something is always drawing on or off;
  - figures never pile up and leave no big bare patch;
  - figures move independently, and the cursor moves them by different amounts;
  - a shift clears and refills them;
  - trim and stagger timing run from nothing to whole.
- Stills at 1080p and 1440p, at several moments, with a shift, at strength 0, 50 and 100,
  and with the nixie meter.
- Frame cost under 1 ms at 1440p.
