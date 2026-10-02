# Divergence Meter

An animated desktop wallpaper: a row of nixie tubes on a walnut base, surrounded by
slowly turning clocks, gears and an escapement, with paint splatter, watercolour and
film texture over the top. It shows the time, the date or a worldline, and every so
often the worldline shifts: the tubes scramble, the clocks spin, and everything settles.

Everything is drawn in code (HTML canvas, no build step). No art from the show is used.

![Preview](wallpaper/preview.jpg)

## Install

### Wallpaper Engine

1. In Steam, right-click **Wallpaper Engine** → **Manage** → **Browse local files**.
2. Open `projects\myprojects` and copy this repo's `wallpaper` folder into it
   (rename it to something like `divergence-meter` if you like).
3. Start (or restart) Wallpaper Engine. The wallpaper appears under **Installed**.
   Select it and apply it to each monitor you want.
4. The three settings appear in the panel on the right.

If moving the mouse or clicking does nothing, check that Wallpaper Engine is set to
pass mouse input to wallpapers.

### Lively Wallpaper

1. Build the package (needs Python 3):

   ```bash
   python tools/package.py
   ```

   This writes `dist/divergence-meter.zip`.
2. In Lively, click **+** (Add Wallpaper) and choose the zip, or drag the zip onto the
   Lively window.
3. Open the wallpaper's **Customise** panel for the settings.

For the parallax and click-to-shift to work, set Lively's wallpaper input to the mouse
in Lively's settings.

## Settings

| Setting | Options | Default |
| --- | --- | --- |
| Display | Time (`HH.MM.SS`, 24-hour), Date (`YY.MM.DD`), Worldline | Time |
| Glow colour | Orange, White | Orange |
| Worldline shifts | On, Off | On |

## How it behaves

- **Worldline shifts** happen at random every 20–60 minutes. The tubes scramble and
  settle with a glow flare while the clocks spin fast (mostly backwards) and settle.
  - In **Time** or **Date** mode the tubes show a canon worldline
    (0.571024, 0.337187, 1.130205 or 1.048596) for about 10 seconds, then roll back.
  - In **Worldline** mode they land on a new worldline and stay there.
- **Clicking** the desktop:
  - in Time or Date mode, spins the clocks and flashes the tubes; the time or date stays put;
  - in Worldline mode, triggers a full shift.
- **Moving the mouse** gives parallax: the deep clockwork drifts with the cursor while the
  nearer layers and the meter move against it.
- With **Worldline shifts** off, nothing shifts and clicks do nothing.
- The upper-right clock shows Akihabara time (UTC+9).

## Performance

- Every static part (tube glass, mesh, glow, gears, dials, paint) is rendered once into an
  image when the wallpaper starts. Each frame only moves and blends those images.
- Capped at 30 fps; Wallpaper Engine's own lower frame limit is respected.
- Rendering stops entirely while the wallpaper is paused or hidden.
- It renders at each monitor's own resolution. The design is 2560×1440 and scales to fit,
  so a 1080p monitor draws about half the pixels of a 1440p one.

## Development

Preview in a browser:

```bash
node tools/serve.js
```

Then open <http://localhost:5173/wallpaper/>. In the browser console, `SG.shift()` triggers
a shift and `SG.click()` simulates a click.

URL parameters:

- Settings: `display=time|date|worldline`, `glow=orange|white`, `shift=0|1`
- Debug only:
  - `now=2026-10-02T10:59:55` fakes the clock
  - `still=8` renders one frame 8 s after start
  - `shiftAt=5` fires a shift at 5 s
  - `cursor=0.8,-0.4` pins the parallax
  - `worldline=1.048596` sets the starting worldline

Tools (the screenshot and recording tools need `tools/serve.js` running):

- `node tools/test.js`: behaviour checks for the display and shift logic
- `tools/shoot.sh <page> <out.png> [query]`: headless Chrome screenshot
- `tools/record.html`: steps the wallpaper frame by frame and saves the frames to
  `shots/frames/` (encode them with ffmpeg)
- `python tools/package.py`: Lively zip

Code layout (`wallpaper/js`):

| File | What it does |
| --- | --- |
| `kit.js` | Noise, easing, canvas helpers |
| `config.js` | Settings from the URL, Lively and Wallpaper Engine |
| `nixie.js` | The tubes: glyphs, glass, mesh, glow, walnut base, scramble and flash |
| `mech.js` | Dials, hands, gears, escapement; 3D tilt; stepped motion |
| `paint.js` | Splats, flicks, watercolour, scratches, drafting marks, worldline diagram |
| `atmos.js` | Dust, film scratches, textured border |
| `scene.js` | Composition, depth, parallax |
| `display.js` | What the tubes show and when the worldline shifts |
| `main.js` | Start-up, render loop, input, pausing |

`mockups/` holds the four static compositions from the design phase.

---

Unofficial fan work. Steins;Gate belongs to its respective owners.
