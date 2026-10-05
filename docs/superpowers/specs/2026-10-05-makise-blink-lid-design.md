# Makise's blink: the lid comes down over the eye

From feedback on the blink:

- Fix the blink on Makise in the rig editor. Maybe the editor itself needs to change for
  blinks: instead of following Wallpaper Engine, the upper eyelid should come down all the
  way to the bottom. One highlight for the area it is dragged over, and another inside it
  for the upper (all blackish) eyelid, dragged down over the whole eye.

## What went wrong

The blink was done as Wallpaper Engine's creators do it with Shake: what's painted over
each eye takes its colour from further up. Above Makise's eyes is her hair, so shut, her
eyes filled with streaks of hair. A hand-painted mask (in the editor) made it worse: it
pulled from further still.

## The blink now

A **Blink** has two masks instead of one:

- **Eye**: where the lid comes down over: all of each eye, from the top of its upper lash
  to its lower lid (the lower lid line too, so the shut lash covers it), leaving out hair
  that hangs in front.
- **Lid**: inside it, the upper lid: the dark lash, a px or so beyond.

And a **skin spot**, a point on bare skin dragged onto the picture like a swing's pivot.

How shut the eyes are (0..1, the same timing as before) says how far the lid has come:

- In each column (along its direction, down), the shader finds where the lid's top and
  bottom edges are and where the eye ends below it: where each mask crosses half strength,
  walking up to 96 px either way in 2 px steps from the pixel it draws (so an eye up to
  about 90 px from the top of its lid to its bottom). The lid is part of the eye.
- Shut, the lid's lower edge comes down to the bottom of the eye: it moves down that
  column's distance between them, times how shut. So the shut lash follows the curve of
  the lower lid.
- What the lid has left or passed over, from where its top was down to its middle, shows
  skin: the colour at the skin spot (five taps around it), shaded warm, by **Shade** at its
  top (under her hair) easing to a third of that by the lash. The lid is drawn over that
  where it has come to, solid inside its edges. Below it, the eye as it was.
- Only inside the eye (or the lid) does anything change. Nothing is pushed, so Hold still
  doesn't come into it, and the rest of the rig is untouched; it is worked out after the
  push, so the masks move with her head and breath. The editor's still picture (while
  painting) doesn't blink.

Settings: Every, Length, Doubles, Direction as before; Travel is gone (the masks say how
far); Shade (0.3).

## The editor

- A blink's two masks show together, the eye in yellow and the lid in blue over it, the one
  being painted the stronger. **Eye** and **Lid** in its settings, or L, choose which the
  brush paints; fill, clear, invert, smooth, Alt+click and the readout work on that one,
  and undo goes back to it.
- The skin spot shows on the picture, in the blink's colour; drag it like a pivot.
- A rig holds at most 15 masks (five textures): a blink takes two, so Add and Duplicate
  count masks, not effects. They're packed in the order of the list, a blink's eye then
  its lid; saved, a blink has `mask`, `lid` and `skin`.

## The rig for makise.webp

- `rigmap.py` makes the eye and lid from a new table of each eye, column by column,
  measured on the picture: the top and bottom rows of the dark upper lash, and the bottom
  row of the eye (its lower lid line where one is drawn, or the last row before bare skin,
  or before the hair in front of her left eye). The old table cut into her left eye's iris
  and reached into her hair.
- The lid is the lash and a row either side; the eye runs from there to a row below the
  eye's bottom, easing up to the lash over the last 4 px of each corner. The skin spot is
  on her cheek at (425, 172), where her skin is an even (233, 216, 200).
- The masks already shipped are kept exactly as they are; they are repacked in the
  editor's order (the eye in the blink's old place, the lid after it), so the forearm, coat
  hem and tie move up one place and the tie goes into a new `makise-rig-4.png`. Loading
  the rig in the editor and saving writes the same files.

## Tests

- A drawn eye: shut, its lash lands on the bottom of the eye, skin above, no eye showing;
  half shut, the lid halfway with the eye below; open, nothing changes; outside it, nothing
  changes; the shader blinks after the push.
- The skin spot's colour, shaded warm, darker at the top.
- The shipped rig: shut, none of either eye shows in the measured columns and the lash is
  down on the bottom; nothing outside the eyes changes.
- Loading: a blink's lid and skin, masks counted.
