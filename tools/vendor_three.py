#!/usr/bin/env python3
"""Vendor Three.js and the addons the scene uses into docs/assets/vendor/three.

The site loads nothing from a CDN, so the library is committed to the repo.
Only the files the scene imports are copied, plus whatever they import in
turn: every relative import is followed until the graph is closed.

    python3 -m tools.vendor_three
"""

import pathlib
import re
import urllib.request

VERSION = "0.186.0"
BASE = "https://cdn.jsdelivr.net/npm/three@%s/" % VERSION
OUT = pathlib.Path("docs/assets/vendor/three")

ENTRIES = [
    "build/three.module.min.js",
    "examples/jsm/postprocessing/EffectComposer.js",
    "examples/jsm/postprocessing/RenderPass.js",
    "examples/jsm/postprocessing/UnrealBloomPass.js",
    "examples/jsm/postprocessing/OutputPass.js",
    "examples/jsm/postprocessing/ShaderPass.js",
    "examples/jsm/objects/Reflector.js",
]

IMPORT = re.compile(r"""(?:from|import)\s*\(?\s*["'](\.{1,2}/[^"']+)["']""")


def fetch(rel):
    with urllib.request.urlopen(BASE + rel, timeout=30) as r:
        return r.read().decode("utf-8")


def resolve(base_rel, spec):
    parts = pathlib.PurePosixPath(base_rel).parent.joinpath(spec).parts
    stack = []
    for p in parts:
        if p == "..":
            stack.pop()
        elif p != ".":
            stack.append(p)
    return "/".join(stack)


def main():
    seen, queue, total = set(), list(ENTRIES), 0
    while queue:
        rel = queue.pop()
        if rel in seen:
            continue
        seen.add(rel)
        src = fetch(rel)
        # jsDelivr minifies three.module.js on request, but the result still
        # imports the unminified 1.4 MB core. Point it at the minified core.
        if rel == "build/three.module.min.js":
            src = src.replace('from"./three.core.js"', 'from"./three.core.min.js"')
        dest = OUT / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(src, encoding="utf-8")
        total += len(src.encode("utf-8"))
        for spec in IMPORT.findall(src):
            queue.append(resolve(rel, spec))
    for rel in sorted(seen):
        print("  " + rel)
    print("three %s: %d files, %.0f KB" % (VERSION, len(seen), total / 1024))


if __name__ == "__main__":
    main()
