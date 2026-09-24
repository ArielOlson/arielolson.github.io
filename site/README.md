# Ariel Olson

Personal portfolio. A scroll-driven WebGL scene: a city skyline reflected in
ice, with a blade trace that morphs between a serpentine edge, a compounding
curve, and a figure eight as the page moves.

## Publishing on GitHub Pages

1. Create a repository and drag the **contents of this folder** into it, so
   `index.html` sits at the repository root.
2. **Settings -> Pages -> Build and deployment**, source **Deploy from a
   branch**, branch `main`, folder `/ (root)`. Save.
3. The site is live a minute later at the address Pages prints.
4. Edit `SITE_URL` in `build_github.py` to that address and rebuild, so the
   canonical link and the social-card previews point at the right place.

## What is here

    index.html              the page
    404.html                styled not-found page
    site.webmanifest        icon and theme metadata
    robots.txt, sitemap.xml search engine basics
    .nojekyll               stops GitHub running Jekyll over the files
    assets/
      styles.css            all styling, including @font-face
      main.js               scene, scroll choreography, reveals
      three.min.js          r128, committed rather than linked
      fonts/                Bodoni Moda, IBM Plex Mono, Schibsted Grotesk
      portrait.png
      favicon.*             icon set
      og-image.png          1200x630 link preview card

No CDN, no analytics, no cookies, no third-party requests of any kind.

## Editing

`index.html` in the parent project is the source of truth. This folder is
generated. Change that file, then run:

    python3 build_github.py

## Browser support

WebGL drives the background. Where it is unavailable the canvas is removed and
a CSS gradient stands in, and the page reads normally. `prefers-reduced-motion`
disables the scene animation, unpins the sticky sections, and turns the
horizontal career track into a vertical list.
