# Steam Workshop listing

Everything needed to publish `wallpaper/` to the Wallpaper Engine Workshop.

## Title

```
Steins;Gate — Divergence Meter & Makise Kurisu
```

(Already set in `wallpaper/project.json`.)

## Preview (the item's icon / tile)

- `wallpaper/preview.gif`: 256×256, 8 s seamless loop at 15 fps, 483 KB. Makise centred,
  her hair swaying and the scene drifting around her; no worldline shift. Already set as
  `preview` in `project.json`. It animates in Wallpaper Engine's browser.
- `workshop/preview-static.jpg`: 1024×1024 still, framed the same way, if you'd rather use
  a sharp static tile.

Steam caps previews at 1 MB; Wallpaper Engine recommends staying under 500 KB and only ever
requests 128×128 for its browser.

## Tags and options

| Field | Value |
| --- | --- |
| Type | Web (automatic) |
| Genre | Anime, Game, Sci-Fi |
| Age rating | Everyone |
| Visibility | Public (or Friends-only for a test run first) |

## Description (paste into the Workshop description; Steam BBCode)

```
[h1]Steins;Gate — Divergence Meter[/h1]

Makise Kurisu among slowly turning clockwork, living ink and drifting light, or a glowing nixie divergence meter showing the time, the date or the current worldline.

Every 20–60 minutes the worldline shifts: the picture flares with light (or the digits scramble), the clocks spin backwards, and everything settles again.

[i]El Psy Kongroo.[/i]

[h2]Features[/h2]
[list]
[*][b]Two centrepieces:[/b] an animated Makise Kurisu, or a nixie divergence meter showing the time (HH.MM.SS), the date (YY.MM.DD) or a worldline
[*][b]Makise comes to life:[/b] her hair sways and ripples in a gusting breeze, her sleeves swing and her left arm bends a little, her coat sways around her legs, she blinks now and then, breathes and floats. Her face holds still but for her blinks.
[*][b]Worldline shifts[/b] at random. In Time or Date mode the meter lands on a canon worldline (0.571024, 0.337187, 1.130205, 1.048596) for a few seconds, then rolls back.
[*][b]Cursor parallax:[/b] the deep clockwork drifts with your mouse while the nearer layers move against it
[*][b]Click the desktop[/b] to spin the clocks and flash the meter (in Worldline mode, to trigger a full shift)
[*]Living ink that blooms, drifts and dissolves; light shafts from a source that slowly crosses the scene; dust, smoke, light leaks and film grain
[*]A faint drafting drawing behind everything, like the schematics in the opening: straight lines growing like a crystal, in formations at their own angles, with rings, ticks, compass fans, hourglass circles and small dials hanging off them, slowly redrawing itself around Makise and the big clock
[*]The upper-right clock keeps Akihabara time (UTC+9)
[/list]

[h2]Settings[/h2]
[list]
[*][b]Centrepiece:[/b] Makise Kurisu, or Nixie meter: time / date / worldline
[*][b]Glow strength[/b] and [b]Glow size:[/b] Makise's backlight or the digits' bloom
[*][b]Ink strength[/b], [b]Texture strength[/b] and [b]Schematic strength[/b]
[*][b]Makise motion[/b], [b]Cursor parallax[/b], [b]Worldline shifts:[/b] on or off
[/list]

[h2]Performance[/h2]
Lightweight. Everything static is rendered once at start-up, it's capped at 30 fps (and respects Wallpaper Engine's own FPS limit), and it stops rendering entirely when paused or covered. Designed at 2560×1440 and drawn at each monitor's own resolution, from 1080p to 4K and ultrawide.

[h2]Tip[/h2]
If moving the mouse or clicking does nothing, make sure mouse input for wallpapers is enabled in Wallpaper Engine's settings.

[hr][/hr]
[i]Unofficial fan work. Steins;Gate and its characters belong to their respective owners.[/i]
```

## Short description (`project.json`, shown in Wallpaper Engine's side panel)

Unchanged:

> Makise Kurisu among slowly turning clockwork, living paint and drifting light, or a nixie
> divergence meter showing the time, the date or a worldline. Move the mouse for parallax;
> click to shift worldlines.

## Gallery screenshots (add on the Workshop page after publishing)

`workshop/screenshots/`, 1920×1080:

1. `01-makise.jpg`: the default look
2. `02-worldline-1.048596.jpg`: worldline mode, the Steins;Gate worldline
3. `03-worldline-0.571024.jpg`: worldline mode, alpha
4. `04-worldline-0.337187.jpg`: worldline mode, beta
5. `05-time.jpg`: time mode, 22.48
6. `06-time-evening.jpg`: time mode, 19.33
7. `07-date-10.07.28.jpg`: date mode on 28 July 2010
8. `08-date-today.jpg`: date mode on 26.10.03
9. `09-shift-makise.jpg`: Makise mid-glitch during a worldline shift
10. `10-shift-nixie.jpg`: the digits scrambling during a shift

Each nixie shot has different ink and light. Leave out 9 and 10 if you'd rather not show
a shift at all.

## Change notes (first upload)

```
First release.
```

## Publishing

The Wallpaper Engine editor only runs on Windows, so this has to happen on a Windows PC
(or one you remote into):

1. Copy `wallpaper/` into Wallpaper Engine's `projects/myprojects/`, then open it in the
   editor (**Open wallpaper** → pick its `project.json`; or drag `index.html` onto the
   editor's **Create wallpaper** to import it as a web wallpaper).
2. Check the folder has nothing that shouldn't be uploaded (`.DS_Store`, `Thumbs.db`).
3. **Workshop** → **Share wallpaper on Workshop**. Paste the title and description above,
   pick the tags and age rating, and confirm the preview is `preview.gif`.
4. Accept the Workshop agreement and publish.
5. On the item's Steam page: **Add/edit images & videos** → upload the gallery screenshots.

After later updates, publish again from the same project so it updates the existing item
instead of making a new one (Wallpaper Engine keeps the item's ID in `project.json`).
