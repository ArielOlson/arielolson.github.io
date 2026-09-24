#!/usr/bin/env python3
"""Render the 1200x630 social card shared when the site URL is posted.

Same vocabulary as the favicon (Space Needle, Empire State, blade trace) but
composed wide, so a link preview on LinkedIn reads as a skyline rather than a
shrunken icon. No text: platforms render og:title beside the image already.
"""

import math
import struct
import zlib

from build_icons import sd_rrect, sd_capsule, png_bytes, BG, FROST, ROSE

W, H = 1200, 630
BASE = 430.0

# (x0, y0, x1, y1, radius)
SHAPES = [
    (140, 350, 205, BASE, 0),
    (220, 320, 275, BASE, 0),
    (318, 250, 342, BASE, 0),      # Space Needle shaft
    (288, 216, 372, 248, 16),      # saucer
    (326, 158, 334, 218, 0),       # mast
    (395, 295, 465, BASE, 0),
    (480, 340, 540, BASE, 0),
    (578, 200, 662, BASE, 0),      # Empire State shaft
    (602, 145, 638, 202, 0),       # crown
    (615, 78, 625, 147, 0),        # mast
    (700, 285, 770, BASE, 0),
    (785, 325, 845, BASE, 0),
    (860, 350, 925, BASE, 0),
    (940, 375, 995, BASE, 0),
    (1010, 390, 1060, BASE, 0),
]

TRACE = ((120.0, 500.0), (600.0, 566.0), (1080.0, 492.0))
TRACE_W = 22.0 / 2.0


def bezier(n=64):
    (ax, ay), (bx, by), (cx, cy) = TRACE
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * ax + 2 * u * t * bx + t * t * cx,
                    u * u * ay + 2 * u * t * by + t * t * cy))
    return pts


PTS = bezier()


def render():
    out = bytearray()
    # precompute bounding boxes so most pixels skip most shapes
    boxes = [(s[0] - 2, s[1] - 2, s[2] + 2, s[3] + 2) for s in SHAPES]
    ty0 = min(p[1] for p in PTS) - TRACE_W - 2
    ty1 = max(p[1] for p in PTS) + TRACE_W + 2

    for y in range(H):
        row = bytearray()
        for x in range(W):
            px, py = x + 0.5, y + 0.5
            col = BG

            d = 1e9
            for i, b in enumerate(boxes):
                if b[0] <= px <= b[2] and b[1] <= py <= b[3]:
                    dd = sd_rrect(px, py, *SHAPES[i])
                    if dd < d:
                        d = dd
            if d < 1.0:
                a = max(0.0, min(1.0, 0.5 - d))
                col = tuple(FROST[i] * a + col[i] * (1 - a) for i in range(3))

            if ty0 <= py <= ty1:
                dt = 1e9
                for i in range(len(PTS) - 1):
                    a0, b0 = PTS[i], PTS[i + 1]
                    if min(a0[0], b0[0]) - TRACE_W - 2 <= px <= max(a0[0], b0[0]) + TRACE_W + 2:
                        v = sd_capsule(px, py, a0[0], a0[1], b0[0], b0[1], TRACE_W)
                        if v < dt:
                            dt = v
                if dt < 1.0:
                    a = max(0.0, min(1.0, 0.5 - dt))
                    col = tuple(ROSE[i] * a + col[i] * (1 - a) for i in range(3))

            # gentle vignette so the card does not read as a flat rectangle
            nx = (x - W / 2) / (W / 2)
            ny = (y - H / 2) / (H / 2)
            v = 1.0 - 0.28 * min(1.0, (nx * nx * 0.75 + ny * ny))
            row += bytes((int(col[0] * v), int(col[1] * v), int(col[2] * v), 255))
        out += row
    return bytes(out)


if __name__ == "__main__":
    data = png_bytes(W, H, render())
    open("og-image.png", "wb").write(data)
    print("wrote og-image.png %dx%d, %.0f KB" % (W, H, len(data) / 1024))
