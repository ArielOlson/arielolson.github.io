# Ariel Olson — portfolio

A scroll-driven WebGL portfolio. A city skyline reflected in a sheet of ice,
with a blade trace that morphs between a serpentine edge, a compounding curve,
and a figure eight as the page moves. The Space Needle and the Empire State
stand in the skyline — Seattle further back and dimmer, New York nearest and
brightest.

Built from three resumes and a LinkedIn profile. Every figure on the page comes
from one of those.

---

## Publishing to GitHub Pages

> **Push the contents of `site/`, not this whole folder.**
>
> The `index.html` in this root directory is the *source* file. It has no
> `<!DOCTYPE>` and no `<head>` on purpose, because the Claude artifact platform
> wraps it in those. If it ends up at a repository root, GitHub Pages will
> serve it instead of the real page and the site will look broken.
>
> `site/index.html` is the complete, standalone document. That is the one to
> publish.

1. Create a repository.
2. Drag the **contents of `site/`** in, so `site/index.html` lands as
   `index.html` at the repository root.
3. **Settings → Pages → Build and deployment**: source **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
4. A minute later the site is live at the address Pages prints.
5. Set `SITE_URL` at the top of `build_github.py` to that address and rebuild.
   The canonical link and the social-card URLs have to be absolute, so link
   previews will not work until this is right.

---

## Three outputs, one source

`index.html` in this folder is the source of truth. Everything else is
generated — never hand-edit the outputs, they get overwritten.

| Output | For | Notes |
| --- | --- | --- |
| `site/` | GitHub Pages | Split into `styles.css` / `main.js`, assets committed. 23 files, 0.82 MB |
| `portfolio-google-sites.html` | Google Sites embed | One self-contained file, 0.81 MB. Paste into Insert → Embed → Embed code |
| `favicon.*`, `og-image.png` | Icons and link previews | Generated from `favicon.svg` geometry |

### Rebuilding

After any edit to `index.html`:

```bash
python3 build_github.py     # -> site/
python3 build_gsites.py     # -> portfolio-google-sites.html
```

The icon and social card only need rebuilding if `favicon.svg` changes:

```bash
python3 build_icons.py      # -> favicon.ico, favicon-*.png, icon-preview.png
python3 build_og.py         # -> og-image.png
```

Python 3 with the standard library. No pip installs, no Node, no build tooling.
The icon rasteriser and the PNG writer are hand-rolled because this machine had
no imaging library.

First run downloads Three.js and the font files into `vendor/` and caches them
there, so later builds are instant. `vendor/` should not be committed.

---

## Structure

```
index.html                   SOURCE — edit this one
build_github.py              -> site/
build_gsites.py              -> portfolio-google-sites.html
build_icons.py               favicon.svg -> .ico / .png set
build_og.py                  -> og-image.png (1200x630 link card)
favicon.svg                  icon artwork; the rasterisers read its geometry
portrait.png                 headshot, extracted from the LinkedIn PDF
icon-preview.png             the icon shown at 16 / 32 / 64 / 128 px

site/                        THE DEPLOYABLE SITE
  index.html                 complete document
  404.html                   styled not-found page
  .nojekyll                  stops GitHub running Jekyll over the files
  robots.txt, sitemap.xml
  site.webmanifest
  assets/
    styles.css               all styling, including @font-face
    main.js                  scene, scroll choreography, reveals
    three.min.js             r128, committed rather than linked
    fonts/                   four woff2 faces, latin subset only
    portrait.png, favicon.*, og-image.png
```

---

## Design

**Palette.** Deep blue-black ground `#07080F`, frost text `#F4F1F5`, rose accent
`#FF7FB0`, ice accent `#7FD9F0`. The two accents are structural, not decorative:
rose marks the finance track, ice marks the skating track, and the particle
field itself warms to rose through the finance chapters and cools back to ice
for the coaching section.

**Type.** Bodoni Moda for display, set at a low optical size so its hairlines
stay solid at large sizes. Schibsted Grotesk for body. IBM Plex Mono for dates,
labels and figures. Only the four weights the page actually renders are shipped.

**The scene.** Roughly 71,000 points in a single draw call: an ice plane, a
five-layer skyline with aerial-perspective falloff, its reflection, and the
trace. Scroll position drives a morph uniform, a camera keyframe track, a
brightness track, and a draw-on uniform that carves the trace twice — once under
the hero and again across the closing shot.

**Degradation.** No WebGL: the canvas is removed and a CSS gradient stands in.
`prefers-reduced-motion`: the scene freezes, sticky sections unpin, and the
horizontal career track becomes a vertical list. Under 760px wide or 480px tall:
same vertical fallback. Reading sections sit on near-opaque panels so text never
competes with the field.

**Privacy.** No CDN, no analytics, no cookies, no third-party requests of any
kind. Three.js and the fonts are served from the repo.

---

## Content

Facts come from three resumes (finance, advisory, skating) and the LinkedIn
profile, with LinkedIn taking precedence where they disagreed — it was the more
current record.

Two things worth knowing if you edit:

- The **employer marks** (`PO`, `UD`, `TSG`, …) are typographic initials, not
  company logos. Real trademarks were left alone deliberately. Swapping in
  actual logo files means replacing `.mark` spans with `<img>`.
- The **Kraken Community Iceplex end date (July 2026)** is inferred, not stated.
  LinkedIn does not list the coaching role, and the Seattle job ended that month.
  Correct it if that is wrong.
