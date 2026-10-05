# Makise blinks, her left arm bends, and her coat sways

From feedback on the rigged Makise:

- Make her blink every so often: a frame or two of her eyes covered by her lashes.
- More movement in her clothes, using the editor's effects.
- Her left arm should sway more, not unnaturally: as if the arm were bending and moving
  about. But not too much: it slightly overlaps her coat, and the coat mustn't get pulled.
- The jacket around her legs should sway more, and maybe the wrinkles in her clothes move.
- Try the tie too (it may need touching up by hand afterwards).

## How Wallpaper Engine does a blink

Creators use the Shake effect: its direction mask is painted downward over the upper
lids, an opacity mask limits it to the lids, and its bounds squeeze the whole movement into
a short burst so it holds open for most of the cycle. Shake repeats on a fixed rhythm, so
a small SceneScript (`engine.setTimeout` with a random delay) is added for randomness. The
usual failure is too little lid above the eye, so the lids shift without closing. Shake
looks up each pixel's colour at an offset (a pull), so the eye is covered, never squeezed.

## Blink

A new effect kind, **Blink**, in `rig.js` and the editor.

- **What it does:** everything painted for it takes its colour from further up (along its
  direction), by as much as is painted there, times how shut the eyes are. Painted
  strongest just above the lower lash and fading upward over the lid, the upper lash comes
  down onto the lower lash and the lid stretches down behind it. The eye is covered, not
  squashed.
- **A pull, after the push:** the other effects push the picture's pixels and the shader
  works back to where each came from (a few rounds of fixed-point iteration). That can't
  undo an eye squeezed shut. So the blink is applied after it, to the point found: a
  lookup further up, in the picture's own px, so its mask moves with her head and breath.
  It ignores Hold still (her face is held), and the editor hides that setting for it. The
  shader skips it while the editor holds the picture still for painting.
- **Settings:** Travel (px the lash comes down at full strength, 20), Every (mean seconds
  between blinks, 5, from 1.5 to 30), Length (seconds a blink takes, 0.16), Doubles (how
  often a second blink follows straight after, 0.15), Direction (90, down).
- **When:** one blink at a random moment in each span of Every seconds (at 0–75% of the
  span), so the gaps run from about a quarter of Every to 1.75× it: 1.25–8.75 s at 5 s.
  Now and then a second blink follows straight after. It's worked out from the time
  alone, so the wallpaper and the editor agree and nothing drifts. All blink effects with
  the same Every blink together, so both eyes always shut at once.
- **Shape of a blink:** shutting over the first 30% (easing in and out), shut for the next
  25%, opening over the last 45%, so it opens a little slower than it shuts. At 0.16 s
  the eyes are at least 85% shut for about 74 ms: two frames at 30 fps, at least one at
  15 fps.
- **Editor:** Blink in the Add list; a **Blink** button under Preview (key K) blinks now;
  its direction shows as an arrow like Waves and Breathe.

### The blink mask for makise.webp

Made by `rigmap.py` from each eye's lash lines, measured from the picture column by column
(the bottom of the upper lash and the top of the lower lid):

- her right eye (screen left) at x 362–396, open up to 22 px; her left eye (screen right)
  at x 441–466, open up to 21 px;
- per column, with `T` how far the eye is open there: nothing above the lid ramp; rising
  over the lid (from `0.8 T` above the 5 px upper lash) to `T` at the lash's resting place
  on the lower lid; `T` over that 5 px; then dropping to nothing within 1.5 px under the
  lower lid. Stored as `T / Travel`.
- So, fully shut, each column's lash lands exactly on its lower lid, and the shut eye
  follows the lower lid's curve. At the corners `T` tapers to nothing.
- Hair strands that cross the eye come down with the lid for those few frames.

## Her left arm (screen right)

- **Left forearm**, a new Swing about her elbow (640, 560), length 290: the sleeve below
  the elbow, its cuff and her hand. On its own slower spring (0.5 Hz) it lags the shoulder
  swing, so the elbow bends. Kept small: at most 3.5 px at the hand.
- Its mask fades out inside the sleeve where the sleeve meets the coat beside it, so the
  coat is never dragged. The shoulder swing already moves the sleeve and that coat
  together, so they stay together; only the small bend differs.
- **Idle**, a new setting for Sway and Swing: how far it drifts about on its own, slowly,
  as if she shifted it (px, 0 by default). Each effect drifts on its own (a mix of slow
  waves, its timing taken from its name), so the forearm and the upper arm aren't in step.
- **Left arm** (the shoulder swing): wind 1.65 → 2, limit 5.8 → 7.5, idle 2.5.
  **Left forearm**: idle 2.

## Her coat

- **Coat hem**, a new Sway: the jacket around her legs, both sides, free toward the hem
  and still at the waist, less near her body, and fading out beside her left forearm so
  neither pulls the other. A slower, heavier spring than her hair, swinging further in the
  breeze (limit 10 px).
- **Coat flutter** ripples double (0.35 → 0.8 px), so the folds in the cuffs and hem
  shimmy more.
- **Tie**, a new Swing from the knot (425, 292), length 325: its lower part sways up to
  2.5 px, fading out just above the belt. It ignores Hold still (the tie is held with her
  body), so the shirt right beside it gives a little. A first pass, to touch up by hand.

## The rig

- Twelve effects: the eight there are, then Blink, Left forearm, Coat hem and Tie, their
  masks in the free slot of `makise-rig-2.png` and a new `makise-rig-3.png`, in the order
  the editor packs them.
- The masks already shipped were touched up in the editor (`makise-rig-0.png` no longer
  matches what `rigmap.py` makes), so they are kept as they are: only the new masks and
  the changed settings are added to the shipped rig. `rigmap.py` makes all twelve, so
  starting over keeps them.
- The most effects a rig can have goes from 12 to 15 (five mask textures), leaving room to
  add more in the editor.

## Tests

- Blink timing: gaps between blinks within a quarter of Every and 1.75× it, about as many
  blinks as expected over an hour, some doubles, at least one frame 85% shut at 15 fps
  and 30 fps, and fully open in between.
- Shut, the eyes show only what's above them: every pixel in the eye opening takes its
  colour from the lash or above; nothing outside the blink mask moves; open, it moves
  nothing.
- Both eyes in one effect; the shipped rig's Blink ignores Hold still.
- The forearm and coat hem never move what is held; at their strongest nothing folds.
- The settle tests measure the springs (Idle set to 0), against where the breeze holds
  them.
- The test that the shader reads every mask counts the blink's lookups.

## Docs

README (Bringing her to life, the rig editor's effects, How it behaves) and the Workshop
description: she blinks now and then, her left arm bends a little at the elbow, her coat
sways around her legs.
