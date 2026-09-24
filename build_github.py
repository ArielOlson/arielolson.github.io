#!/usr/bin/env python3
"""Generate the GitHub Pages deployment folder from index.html.

The artifact build keeps everything in one file because the artifact platform
wants it that way. A git repo does not: splitting the stylesheet and script out
makes diffs readable and lets the browser cache them separately.

Nothing is loaded from a CDN. Three.js and the font files are committed to the
repo, so the site has no third-party requests at all: it cannot be broken by a
CDN outage, and it sets no third-party cookies.

Output lands in site/ and is ready to drag into a repository.

Run after every edit to index.html:    python3 build_github.py
"""

import base64
import hashlib
import pathlib
import re
import shutil
import urllib.request

# Change this to the real address once the repo is published. It only affects
# the canonical link and the social-card URLs, which must be absolute.
SITE_URL = "https://arielnolson.github.io/portfolio/"

SRC = pathlib.Path("index.html")
OUT = pathlib.Path("site")
ASSETS = OUT / "assets"
FONTS = ASSETS / "fonts"
VENDOR = pathlib.Path("vendor")

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")
KEEP_SUBSETS = {"latin"}

TITLE_FALLBACK = "Ariel Olson"
DESCRIPTION = (
    "Ariel Olson, AWMA®. Associate Wealth Advisor at Midas Wealth in New York. "
    "Previously primary on a third of a $500 million book in Seattle."
)


def fetch(url, note=""):
    VENDOR.mkdir(exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    ext = ".woff2" if ".woff2" in url else (".js" if url.endswith(".js") else ".css")
    cached = VENDOR / (key + ext)
    if cached.exists():
        return cached.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req).read()
    cached.write_bytes(data)
    print(f"    downloaded {note or url[:56]} ({len(data)/1024:.0f} KB)")
    return data


def slug(text):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def build_fonts(css_url):
    """Write woff2 files into assets/fonts and return @font-face CSS."""
    css = fetch(css_url, "Google Fonts CSS").decode("utf-8")
    faces = re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})", css, re.S)
    rules, seen, total = [], {}, 0
    for subset, block in faces:
        if subset not in KEEP_SUBSETS:
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        fam = re.search(r"font-family: '([^']+)'", block).group(1)
        wt = re.search(r"font-weight: ([^;]+);", block).group(1).strip()
        if url not in seen:
            data = fetch(url, f"{fam} {wt}")
            name = f"{slug(fam)}-{wt.replace(' ', '-')}.woff2"
            (FONTS / name).write_bytes(data)
            seen[url] = name
            total += len(data)
        block = re.sub(r"url\(https://[^)]+\.woff2\)",
                       f"url(fonts/{seen[url]})", block)
        block = re.sub(r"\s*unicode-range:[^;]+;", "", block)
        rules.append(block)
    print(f"    {len(rules)} faces, {len(seen)} files, {total/1024:.0f} KB")
    return "\n".join(rules)


html = SRC.read_text(encoding="utf-8")

title_m = re.search(r"<title>(.*?)</title>", html, re.S)
title = title_m.group(1).strip() if title_m else TITLE_FALLBACK
style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
font_url = re.search(r'href="(https://fonts\.googleapis\.com/css2[^"]+)"', html).group(1)
three_url = re.search(r'<script src="(https://cdnjs[^"]+)"></script>', html).group(1)

body = html.split("</style>", 1)[1].strip()

# the page script is the last <script> block, everything after the three.js tag
main_js = re.search(r"<script>\s*(\(function \(\) \{.*?\})\)\(\);\s*</script>",
                    body, re.S).group(1) + ")();"

for d in (OUT, ASSETS, FONTS):
    d.mkdir(parents=True, exist_ok=True)

print("  fonts...")
font_css = build_fonts(font_url)

print("  three.js...")
(ASSETS / "three.min.js").write_bytes(fetch(three_url, "three.js"))

# lift the portrait out of the HTML so the browser can cache it
portrait = re.search(r'src="data:image/png;base64,([^"]+)"', body)
if portrait:
    (ASSETS / "portrait.png").write_bytes(base64.b64decode(portrait.group(1)))
    body = body.replace(portrait.group(0), 'src="assets/portrait.png"')

# strip both script tags out of the body; they are re-added in the document below
body = re.sub(r'<script src="https://cdnjs[^"]+"></script>', "", body)
body = re.sub(r"<script>\s*\(function \(\) \{.*?\}\)\(\);\s*</script>", "", body, flags=re.S)
body = body.strip()

RESET = """/* Reset. The artifact host supplies its own; a plain page needs this. */
html{
  color-scheme:dark;
  -webkit-text-size-adjust:100%;
  scrollbar-color:#282D3C #07080F;
}
:root{
  padding-top:env(safe-area-inset-top,0px);
  padding-bottom:env(safe-area-inset-bottom,0px);
}
body{margin:0;background:#07080F;color:#F4F1F5;font:14px/1.5 system-ui,sans-serif}
img{max-width:100%}
[hidden]{display:none!important}
"""

SHORT = """
/* A short viewport cannot hold a pinned section. */
@media (max-height:480px){
  #hero{min-height:0;padding-block:78px 42px}
  .chapter{height:auto}
  .chapter .pin{position:static;height:auto;padding-block:62px}
  #contact{height:auto}
  #contact .pin{position:static;height:auto;padding-block:62px}
  .hpin{position:static;height:auto;padding-block:58px;overflow:visible}
  .hviewport{overflow:visible}
  .htrack{flex-direction:column;transform:none !important}
  .hcard{flex:1 1 auto}
  .hprog,.hhint{display:none}
}
"""

(ASSETS / "styles.css").write_text(font_css + "\n\n" + RESET + style + SHORT,
                                   encoding="utf-8")
(ASSETS / "main.js").write_text(main_js + "\n", encoding="utf-8")

# icons and social card
for f in ("favicon.svg", "favicon.ico", "favicon-16.png", "favicon-32.png",
          "favicon-48.png", "favicon-180.png", "favicon-512.png", "og-image.png"):
    if pathlib.Path(f).exists():
        shutil.copy(f, ASSETS / f)

JSONLD = f"""{{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Ariel Olson",
  "honorificSuffix": "AWMA\\u00ae",
  "jobTitle": "Associate Wealth Advisor",
  "worksFor": {{ "@type": "Organization", "name": "Midas Wealth" }},
  "address": {{ "@type": "PostalAddress", "addressLocality": "New York", "addressRegion": "NY" }},
  "alumniOf": {{ "@type": "CollegeOrUniversity", "name": "University of Delaware" }},
  "url": "{SITE_URL}",
  "sameAs": ["https://www.linkedin.com/in/arielnolson/"]
}}"""

doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{title}</title>
<meta name="description" content="{DESCRIPTION}">
<meta name="author" content="Ariel Olson">
<meta name="theme-color" content="#07080F">
<meta name="color-scheme" content="dark">
<link rel="canonical" href="{SITE_URL}">

<meta property="og:type" content="profile">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:url" content="{SITE_URL}">
<meta property="og:image" content="{SITE_URL}assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{DESCRIPTION}">
<meta name="twitter:image" content="{SITE_URL}assets/og-image.png">

<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="assets/favicon-32.png">
<link rel="icon" href="assets/favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="assets/favicon-180.png">
<link rel="manifest" href="site.webmanifest">

<link rel="preload" as="font" type="font/woff2" href="assets/fonts/bodoni-moda-600.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="assets/fonts/schibsted-grotesk-400-500.woff2" crossorigin>
<link rel="stylesheet" href="assets/styles.css">

<script type="application/ld+json">
{JSONLD}
</script>
</head>
<body>
{body}
<script src="assets/three.min.js"></script>
<script src="assets/main.js"></script>
</body>
</html>
"""

(OUT / "index.html").write_text(doc, encoding="utf-8")

# GitHub Pages runs Jekyll unless told not to, which skips files starting with _
(OUT / ".nojekyll").write_text("", encoding="utf-8")

(OUT / "site.webmanifest").write_text(f"""{{
  "name": "Ariel Olson",
  "short_name": "Ariel Olson",
  "description": "{DESCRIPTION}",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#07080F",
  "theme_color": "#07080F",
  "icons": [
    {{ "src": "assets/favicon-180.png", "sizes": "180x180", "type": "image/png" }},
    {{ "src": "assets/favicon-512.png", "sizes": "512x512", "type": "image/png" }},
    {{ "src": "assets/favicon.svg", "type": "image/svg+xml", "purpose": "any" }}
  ]
}}
""", encoding="utf-8")

(OUT / "robots.txt").write_text(
    f"User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}sitemap.xml\n", encoding="utf-8")

(OUT / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    f"  <url><loc>{SITE_URL}</loc><changefreq>monthly</changefreq></url>\n"
    "</urlset>\n", encoding="utf-8")

(OUT / "404.html").write_text(f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Not found</title>
<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">
<link rel="stylesheet" href="assets/styles.css">
<style>
  body{{display:grid;place-items:center;min-height:100vh;text-align:center;padding:24px}}
  .box{{max-width:44ch}}
  .code{{font-family:"IBM Plex Mono",monospace;font-size:12px;letter-spacing:.24em;
        text-transform:uppercase;color:#FF7FB0;margin:0 0 18px}}
  h1{{font-family:"Bodoni Moda",serif;font-weight:600;font-size:clamp(2rem,6vw,3.2rem);
     line-height:1.06;margin:0 0 16px;display:block}}
  p{{color:#A9AEBE;margin:0 0 28px}}
  a{{display:inline-flex;font-family:"IBM Plex Mono",monospace;font-size:12px;
    letter-spacing:.15em;text-transform:uppercase;text-decoration:none;
    padding:15px 24px;border:1px solid #282D3C;color:#F4F1F5;background:#0E1119}}
  a:hover{{border-color:#FF7FB0;color:#FFB3CE}}
</style>
</head>
<body>
  <div class="box">
    <p class="code">404</p>
    <h1>That page is not here.</h1>
    <p>The link may be out of date, or the page may have moved.</p>
    <a href="./">Back to the start</a>
  </div>
</body>
</html>
""", encoding="utf-8")

(OUT / "README.md").write_text(f"""# Ariel Olson

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
""", encoding="utf-8")

total = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file())
count = sum(1 for f in OUT.rglob("*") if f.is_file())
print(f"\nwrote {OUT}/ - {count} files, {total/1024/1024:.2f} MB")
print(f"  SITE_URL = {SITE_URL}")
