# arielolson.com

Personal site of Ariel Olson, AWMA®. A night skyline on a frozen harbour,
rendered live in WebGL: Seattle's Space Needle further back, New York's Empire
State nearest, its crown floodlit rose. A blade trace carves the ice below and
changes shape as the story moves. The camera follows the page, to New York
when the text is about New York and to Seattle when it is about Seattle.

No framework, no build step, no CDN. Plain HTML, CSS and ES modules on a
vendored copy of Three.js.

---

## Publishing

1. Put the contents of this folder on the `main` branch of the repository.
2. **Settings → Pages → Build and deployment**: source **Deploy from a
   branch**, branch `main`, folder **`/docs`**. Save.
3. Under **Custom domain**, `www.arielolson.com` should already show (it comes
   from `docs/CNAME`). Once the check passes, tick **Enforce HTTPS**.

DNS at Squarespace is already correct: apex `A` records to GitHub's four
addresses, apex `AAAA` to the four IPv6 addresses, `www` as a `CNAME` to
`arielolson.github.io`.

> `docs/CNAME` must stay in the repo. If it is deleted, GitHub reports the
> domain as improperly configured and stops issuing the HTTPS certificate.

---

## Structure

```
docs/                          the website, exactly as GitHub Pages serves it
  index.html
  404.html
  CNAME  .nojekyll  robots.txt  sitemap.xml  site.webmanifest
  assets/
    css/styles.css
    js/
      main.js                  entry: starts the UI, loads the scene, runs the frame loop
      ui/
        reveal.js              sections easing in, figures counting up
        career.js              the horizontal career pan
        type.js                the name rising in, the statement lighting word by word
        spotlight.js           light under the pointer on the case cards
      scene/
        index.js               renderer, intro, adaptive quality, frame update
        world.js               palette, landmark positions, fog
        story.js               one camera shot per page section
        city.js                the skyline: one instanced mesh, windows drawn in a shader
        landmarks.js           the Space Needle as real geometry
        ice.js                 the reflective ice sheet
        trace.js               the blade trace and its ice spray
        sky.js                 sky dome and stars
        snow.js
        post.js                bloom, tone mapping, vignette, grain
        util.js
    vendor/three/              Three.js 0.186, only the files the scene uses
    fonts/  img/  icons/

tools/                         for development only; never served
  serve.py                     local preview
  icons.html                   favicon workbench: previews and renders every icon format
  vendor_three.py              re-download Three.js
```

---

## Preview locally

```bash
python3 -m tools.serve
```

Then open http://localhost:8765. Opening `docs/index.html` straight from the
file system will not work: browsers refuse to load ES modules from `file://`.

---

## Changing things

**Words.** All copy is in `docs/index.html`.

**Colours.** Page colours are the CSS variables at the top of
`assets/css/styles.css`. Scene colours are `PALETTE` in
`assets/js/scene/world.js`. Rose `#FF7FB0` and ice `#7FD9F0` appear in both;
change them together.

**Camera.** Each section of the page has a shot in `assets/js/scene/story.js`:
a position, a target, which shape the trace takes, and whether it is drawn.
Shots are anchored to the sections themselves, so adding or removing content
does not throw the choreography off. A new section with an `id` can be given
its own shot by adding a line.

**The skyline.** Buildings are generated from a fixed seed in
`assets/js/scene/city.js`, so the city is identical on every visit. Change the
seed in `rng(20260924)` for a different layout. The Empire State's tiers follow
the real building's proportions and are listed in `ESB_TIERS`.

**Favicon.** `assets/icons/favicon.svg` is the master: an AO monogram cut in
Bodoni, the A in rose and the O in ice, the A passing in front of the O. Below
32px its own media query thickens the hairlines and drops the glint so it still
reads in a browser tab. Every other icon file is rendered from it. After editing
the SVG, run the preview server, open http://localhost:8765/__tools/icons.html
to check it at real sizes on light and dark tabs, and press **Render all
formats** to rewrite the PNGs and the ICO.

**Social card.** `assets/img/og-image.jpg` is a frame of the live scene. To
re-render it after changing the scene, run the preview server, open
`http://localhost:8765/?capture`, and run this in the browser console:

```js
const s = __scene, r = s.renderer, cam = s.post.composer.passes[0].camera;
r.setPixelRatio(1); r.setSize(1200, 630, false); s.post.setSize(1200, 630, 1);
cam.aspect = 1200 / 630; cam.fov = 42; cam.updateProjectionMatrix();
s.cam.pos.set(2, 5.2, 36); s.cam.look.set(-4, 10, -42); s.place();
for (let i = 0; i < 3; i++) s.post.render(20 + i * 0.016);
document.getElementById('gl').toBlob(b => fetch('/__capture', { method: 'POST', body: b }), 'image/jpeg', 0.86);
```

---

## Behaviour worth knowing

- **Loading.** The page is readable immediately. The 3D scene loads after, and
  fades in on its first frame while the city switches on window by window.
- **No WebGL 2, or the scene fails to load.** A CSS gradient takes its place and
  the page works in full. A dropped connection gets one retry first.
- **`prefers-reduced-motion`.** The scene renders one still frame and stops.
  The ticker, the kinetic type and the pinned sections all go static.
- **Phones.** Fewer buildings and less snow, a lower-resolution reflection, no
  multisampling, a wider lens for portrait screens. The career pan becomes a
  vertical list below 760px wide.
- **Slow devices.** If frames run long after the intro, the resolution steps
  down once.
- **Behind reading panels** the scene draws at a third of the frame rate, since
  almost none of it shows.
- **Privacy.** No analytics, no cookies, no third-party requests.

Measured at a steady 60 fps (p95 17 ms) with reflection and bloom running.

---

## Credits

Three.js is MIT licensed. Bodoni Moda, Schibsted Grotesk and IBM Plex Mono are
under the SIL Open Font License. Everything else in the scene is drawn in code.
