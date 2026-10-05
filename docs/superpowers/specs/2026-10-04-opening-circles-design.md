# Circles from the opening, lines under Makise, and the big clock

The fourth take on the schematics behind the scene (after the
[woven drawing](2026-10-04-woven-schematics-design.md)), from feedback on it:

- The drawing is kept away from Makise on purpose, but it should run on under her: there's
  a lot of empty space round her to fill.
- The big clock on the right is always hard to see. The right gets cluttered whenever
  something is added there, as the lines do now, and the clock gets lost. Maybe raise its
  opacity.
- The lines are good, but it's only lines. Some other designs could be involved too: a few
  dim circles on the lines, beside them or otherwise part of them, from the opening and the
  official art.

## Looking at the references

- **The opening's drafting frames:** circles everywhere, and always with the lines:
  - concentric pairs like pulleys or washers, where lines cross and with the lines
    through them;
  - small circles with two opposite wedges filled in, like an hourglass (⧗);
  - quarter-circle fans between two lines, with ticks like a protractor;
  - circles resting on a line;
  - compass arms, pendulums, set squares and ruler ticks.
- **huke's official art:** big gears and clock faces painted behind the characters. Fine
  drafting circles are laid over them, and the hourglass circle turns up again.

## Look

### Lines under Makise

- With Makise as the centrepiece, the drawing is no longer cleared round her. It grows
  evenly over the whole frame and runs on behind her.
- It goes in after the pool of dark the scene keeps round her, so it reaches into that pool
  at its usual brightness.
- Shapes keep off where her figure would only hide them, roughly her head, coat and the top
  of her legs. They gather in the space round her instead.
- A worldline shift still wipes the drawing outward from her.
- **The meter is unchanged:** it keeps its clear middle and its pool of dark, so the digits
  stay readable.

### The big clock

- The astrolabe (the giant dial on the right) goes from 12% to 20% opacity, the same as the
  half clock at the top.
- The drawing grows thinner over its face: the face takes half the line of anywhere else,
  easing off toward its rim.
- No shapes go on its face.
- The lines there keep their usual brightness. There are just fewer of them, so the clock
  reads first.

### Circles from the opening

About 6–10 on screen at once (never more than 10), each on the lines and drawn with them.
They're as dim as the lines or a little dimmer, mostly in the left two-thirds, and well
apart: their circles never come within 80 px of one another.

- **Pulley rings:** where two lines cross, an outer ring (radius 36–110 px) and an inner one
  about a third its size, sometimes a third ring between them, and sometimes a dot at the
  centre. The lines run through them.
- **Hourglass circles:** a small ring (radius 16–44 px) with two opposite wedges filled in
  dimly, along or across its line. Some have a second ring round them. They sit where lines
  cross, or strung on a line. Like the clocks, they turn a step now and then.
- **Compass fans:** where two lines cross, an arc (radius 110–260 px) between them with
  ruler ticks (every fifth longer). The fan's two straight sides are the lines themselves.
  Sometimes there's a second, inner arc, and a small ring at the centre.
- **Circles resting on a line:** a circle (radius 28–90 px) touching the line, with its
  radius drawn to where it touches and a dot at its centre.

They draw on as the pen passes them, like the other shapes:
- rings are swept round as by a compass;
- the hourglass's wedges fill in after its ring;
- a fan's arc is swept with the compass arm showing, then its ticks appear along it;
- a resting circle is swept round from where it touches, then its radius drawn.

They erase with their lines, and the small shapes the drawing has now stay.

### Amount

The drawing holds the same amount of line per part of the frame it fills as now. So the
number of growths follows how much of the frame is open: about 56 with Makise and about 50
with the meter, against 60 now, since the clock's face takes less.

## Approaches considered

- **Circles as their own figures (the second take):** read as random circles. Here every
  circle is anchored to lines.
- **Big construction circles (radius 150–400 px):** closer to the clockwork's scale, but they
  would compete with the giant dials. The circles stay mid-sized.
- **Dimming the lines over the clock (a mask):** it would leave a visibly darker disc, half
  the frame wide. Thinning the growth there keeps every line the same brightness.

## Files

- `wallpaper/js/schematic.js`:
  - the centrepiece and the clock's face (`centre()` and `quiet()`);
  - the count following the open frame;
  - the four circles;
  - fills.
- `wallpaper/js/scene.js`: the astrolabe's opacity, and its face exported.
- `wallpaper/js/portrait.js`: her figure, as ellipses.
- `wallpaper/js/main.js`:
  - passing the centrepiece, her figure and the clock's face;
  - the drawing going in after the pool of dark round Makise.
- `tools/test.js`: the schematic tests for the above.
- Docs: `README.md`, `workshop/WORKSHOP.md`.

## Testing

- `node tools/test.js`:
  - every circle lies on its lines and goes when they do;
  - a few at a time (never more than 10), well apart, none on the clock's face and none
    behind Makise;
  - the hourglasses turn only in steps;
  - with Makise, the drawing reaches round her as evenly as anywhere else;
  - with the meter, it keeps the clear middle;
  - the number of growths follows the open frame;
  - the rest as before.
- Stills:
  - at 1440p, 1080p and 4K;
  - both centrepieces;
  - the clock before and after;
  - the circles close up.
- Frame cost before and after.
