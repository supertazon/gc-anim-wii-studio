# GC-anim-Wii Studio

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/gc-anim-wii-studio-logo-dark-bg.png">
    <img alt="GC-anim-Wii Studio" src="assets/gc-anim-wii-studio-logo-light-bg.png" width="420">
  </picture>
</p>

https://github.com/user-attachments/assets/775d0a83-4153-4b6e-b38b-15ee6900903d

A web page to customize [GC-anim-Wii](https://github.com/supertazon/GC-anim-Wii): edit `gc-anim.ini`, design the "GAMECUBE" logotype, and preview any frame of the boot animation rendered from your own GameCube IPL dump. The dump stays in your browser and is never uploaded. Built using Claude.

## Use

Open the page, load your `ipl.bin` (scrambled or not), change the settings, then **Save gc-anim-wii.zip** and unzip it at the root of the SD card or USB drive.

The preview renders live the frames from the IPL and [promo](https://youtu.be/CjkYhI2MaPQ?si=BdSUqR9RyB1k-F6U&t=15) animations.

**Export MP4** renders the whole animation with the current settings and encodes it in the browser with WebCodecs (H.264 where available, VP9 otherwise). It takes a minute or two, no audio is included.

All of GC-anim-Wii's `gc-anim.ini` settings can be edited, including `intro`, `delay`, `color = random` and `[smb]`. The preview and the MP4 follow `intro`: the IPL boot animation, or the promo intro (`src/promo.js`, a port of `promo.c`). With `color = random`, the preview shows one possible draw of the scheme (**New draw** for another), made with the program's own drawing code.

A three-slide tutorial opens once, after the first IPL upload; the **?** button in the header shows it again. Its pictures are rendered at that moment from the user's own IPL, so nothing from Nintendo is stored in the page or the repo.

## Layout

- `src/` — the page's modules. Most are ports of GC-anim-Wii's own code (`config.c`, `recolor.c`, `scene.c`, `intro.c`, `anim.c`, `j3d.c`, `ipl.c`, `textimg.c`, `promo.c` with `anim_data.h`); `gx.js` is a small software GX renderer based on GC-anim-Wii's `tools/swr.py`; `mp4.js` is a minimal MP4 writer for the video export.
- `template.html` — layout and styles.
- `build.py` — inlines everything into one file, `docs/index.html`, which GitHub Pages serves. The page's icon is `docs/favicon.png` (add your own; the page works without it).
- `tools/render_frame.js` — renders frames to PNG from the command line with the same code:
  `node tools/render_frame.js ipl.bin [--ini gc-anim.ini] [--logo logo.png] [--wide] [--out dir] [frames...]` (an ini with `intro = promo` renders the promo intro)

After changing `src/` or `template.html`, run `python3 build.py` and commit `docs/index.html`.

## Translations

The page is in English, French, Spanish, Portuguese (Brazil and Portugal), Italian, German, Japanese, Simplified Chinese and Korean. English text is the key: each `src/i18n/<lang>.js` maps an English string to its translation, and anything missing falls back to English. `python3 tools/i18n_strings.py` lists missing strings or broken `{placeholders}` per language; `--list` prints every English string.
