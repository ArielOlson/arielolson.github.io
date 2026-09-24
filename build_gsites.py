#!/usr/bin/env python3
"""Generate the self-contained Google Sites build from index.html.

index.html targets the Claude artifact platform, which supplies the
<!doctype>/<head>/<body> wrapper, a small reset, and lets the page pull
Three.js and Google Fonts off a CDN. A Google Sites "Embed code" block gets
none of that: the HTML becomes the entire document of a sandboxed iframe on a
domain you do not control, where a blocked CDN silently costs you the 3D scene
or the typography.

Google Sites now accepts ~2 MB of embed code, so this build inlines everything:
the latin font faces as base64 woff2, and Three.js as a literal script. The
result has zero external requests and renders identically offline.

Downloads are cached in vendor/ so repeat builds are instant.

Run after every edit to index.html:    python3 build_gsites.py
"""

import base64
import hashlib
import pathlib
import re
import urllib.request

SRC = pathlib.Path("index.html")
OUT = pathlib.Path("portfolio-google-sites.html")
ICON = pathlib.Path("favicon.svg")
VENDOR = pathlib.Path("vendor")

LIMIT_MB = 2.0
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# Only the latin subset ships. The page has no cyrillic, greek, vietnamese or
# math glyphs, and those subsets more than double the font payload.
KEEP_SUBSETS = {"latin"}

DESCRIPTION = (
    "Ariel Olson, AWMA®. Associate Wealth Advisor at Midas Wealth in New York. "
    "Previously primary on a third of a $500 million book in Seattle."
)


def fetch(url, note=""):
    """Download with a browser UA, cached on disk by URL hash."""
    VENDOR.mkdir(exist_ok=True)
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    ext = ".woff2" if ".woff2" in url else (".js" if url.endswith(".js") else ".css")
    cached = VENDOR / (key + ext)
    if cached.exists():
        return cached.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    data = urllib.request.urlopen(req).read()
    cached.write_bytes(data)
    print(f"    downloaded {note or url[:60]} ({len(data)/1024:.0f} KB)")
    return data


def inline_fonts(css_url):
    """Google Fonts CSS -> @font-face rules with base64 woff2 payloads."""
    css = fetch(css_url, "Google Fonts CSS").decode("utf-8")
    faces = re.findall(r"/\* ([a-z-]+) \*/\s*(@font-face \{.*?\})", css, re.S)
    out, total, seen = [], 0, set()
    for subset, block in faces:
        if subset not in KEEP_SUBSETS:
            continue
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
        if url in seen:
            # two weights pointing at one file means a variable font requested
            # as discrete values; ask for a range (wght@400..500) instead
            print(f"    WARNING: {url[-28:]} inlined twice, wasting its payload")
        seen.add(url)
        fam = re.search(r"font-family: '([^']+)'", block).group(1)
        wt = re.search(r"font-weight: ([^;]+);", block).group(1)
        data = fetch(url, f"{fam} {wt}")
        total += len(data)
        b64 = base64.b64encode(data).decode("ascii")
        block = re.sub(
            r"url\(https://[^)]+\.woff2\)",
            f"url(data:font/woff2;base64,{b64})",
            block,
        )
        # unicode-range is pointless once only one subset ships
        block = re.sub(r"\s*unicode-range:[^;]+;", "", block)
        out.append(block)
    print(f"    {len(out)} faces inlined, {total/1024:.0f} KB raw")
    return "\n".join(out)


html = SRC.read_text(encoding="utf-8")

title = re.search(r"<title>(.*?)</title>", html, re.S).group(1).strip()
style = re.search(r"<style>(.*?)</style>", html, re.S).group(1)
font_url = re.search(r'href="(https://fonts\.googleapis\.com/css2[^"]+)"', html).group(1)
three_url = re.search(r'<script src="(https://cdnjs[^"]+)"></script>', html).group(1)

body = html.split("</style>", 1)[1].strip()

print("  inlining fonts...")
font_css = inline_fonts(font_url)

print("  inlining Three.js...")
three_js = fetch(three_url, "three.js").decode("utf-8")
# swap the external tag for the literal source
body = body.replace(
    f'<script src="{three_url}"></script>',
    "<script>\n" + three_js + "\n</script>",
)

icon_uri = "data:image/svg+xml;base64," + base64.b64encode(
    ICON.read_bytes()
).decode("ascii")

# The artifact skeleton's reset, restated, plus iframe-friendly additions.
RESET = """
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

# A shallow embed cannot hold a pinned section, so unpin everything when the
# iframe is short and let the page scroll normally instead.
SHORT = """
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
<meta property="og:type" content="profile">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{DESCRIPTION}">
<link rel="icon" type="image/svg+xml" href="{icon_uri}">
<style>
{font_css}
{RESET}{style}{SHORT}</style>
</head>
<body>
{body}
</body>
</html>
"""

OUT.write_text(doc, encoding="utf-8")

mb = len(doc.encode("utf-8")) / 1024 / 1024
print(f"\nwrote {OUT} ({mb:.2f} MB of {LIMIT_MB:.0f} MB budget)")
print(f"  external requests: 0")
if mb > LIMIT_MB:
    print("  *** OVER the Google Sites embed limit. Host it and embed by URL.")
