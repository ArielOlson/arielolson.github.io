#!/usr/bin/env python3
"""Rasterise favicon.svg to PNG/ICO without external deps.

The mark is the site's story compressed to a glyph: the Space Needle and the
Empire State standing in a skyline, over a carved blade trace. Everything is
described as signed distance fields, which antialias cleanly at 16px where a
naive scan conversion turns to mush.

Keep the geometry below in step with favicon.svg.
"""

import math
import struct
import zlib

BG = (0x07, 0x08, 0x0F)
FROST = (0xF4, 0xF1, 0xF5)
ROSE = (0xFF, 0x7F, 0xB0)
CORNER = 13.0

# (x0, y0, x1, y1, corner_radius) in the 64-unit viewBox
BUILDINGS = [
    (11.4, 26.0, 14.4, 42.0, 0.0),    # Space Needle shaft
    (7.4, 21.4, 18.4, 25.8, 2.2),     # saucer
    (12.2, 14.5, 13.7, 21.5, 0.0),    # mast
    (22.0, 30.0, 30.0, 42.0, 0.0),    # block
    (33.0, 21.0, 42.0, 42.0, 0.0),    # Empire State shaft
    (35.6, 14.5, 39.4, 21.5, 0.0),    # crown
    (36.9, 7.5, 38.4, 14.9, 0.0),     # mast
    (45.5, 33.0, 53.5, 42.0, 0.0),    # block
]

# quadratic bezier for the blade trace, matching the SVG path
TRACE = ((9.0, 49.5), (32.0, 56.0), (55.0, 48.5))
TRACE_W = 3.6 / 2.0


def sd_rrect(px, py, x0, y0, x1, y1, r):
    cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
    hw, hh = (x1 - x0) / 2.0, (y1 - y0) / 2.0
    r = min(r, hw, hh)
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    return math.hypot(max(qx, 0.0), max(qy, 0.0)) + min(max(qx, qy), 0.0) - r


def sd_capsule(px, py, ax, ay, bx, by, r):
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    d = bax * bax + bay * bay
    h = 0.0 if d == 0 else max(0.0, min(1.0, (pax * bax + pay * bay) / d))
    return math.hypot(pax - bax * h, pay - bay * h) - r


def _bezier_pts(n=28):
    (ax, ay), (bx, by), (cx, cy) = TRACE
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append((u * u * ax + 2 * u * t * bx + t * t * cx,
                    u * u * ay + 2 * u * t * by + t * t * cy))
    return pts


TRACE_PTS = _bezier_pts()


def sd_trace(px, py):
    best = 1e9
    for i in range(len(TRACE_PTS) - 1):
        a, b = TRACE_PTS[i], TRACE_PTS[i + 1]
        d = sd_capsule(px, py, a[0], a[1], b[0], b[1], TRACE_W)
        if d < best:
            best = d
    return best


def over(dst, src, a):
    return tuple(src[i] * a + dst[i] * (1.0 - a) for i in range(3))


def render(size, ss=3):
    scale = size / 64.0
    out = bytearray()
    inv = 1.0 / (ss * ss)

    for y in range(size):
        row = bytearray()
        for x in range(size):
            ar = ag = ab = aa = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    ux = (x + (sx + 0.5) / ss) / scale
                    uy = (y + (sy + 0.5) / ss) / scale

                    def cov(d):
                        return max(0.0, min(1.0, 0.5 - d * scale))

                    bg_a = cov(sd_rrect(ux, uy, 0, 0, 64, 64, CORNER))
                    if bg_a <= 0.0:
                        continue

                    col = BG
                    db = min(sd_rrect(ux, uy, *b) for b in BUILDINGS)
                    cb = cov(db)
                    if cb > 0:
                        col = over(col, FROST, cb)
                    ct = cov(sd_trace(ux, uy))
                    if ct > 0:
                        col = over(col, ROSE, ct)

                    ar += col[0] * bg_a
                    ag += col[1] * bg_a
                    ab += col[2] * bg_a
                    aa += bg_a

            alpha = aa * inv
            if alpha <= 0.001:
                row += b"\x00\x00\x00\x00"
            else:
                row += bytes((int(round(ar / aa)), int(round(ag / aa)),
                              int(round(ab / aa)), int(round(alpha * 255))))
        out += row
    return bytes(out)


def _chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def png_bytes(w, h, rgba):
    raw = b"".join(b"\x00" + rgba[y * w * 4:(y + 1) * w * 4] for y in range(h))
    return (b"\x89PNG\r\n\x1a\n"
            + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + _chunk(b"IDAT", zlib.compress(raw, 9))
            + _chunk(b"IEND", b""))


def ico_bytes(pngs):
    n = len(pngs)
    header = struct.pack("<HHH", 0, 1, n)
    offset = 6 + 16 * n
    entries, blobs = b"", b""
    for size, data in pngs:
        entries += struct.pack("<BBBBHHII", size, size, 0, 0, 1, 32,
                               len(data), offset)
        blobs += data
        offset += len(data)
    return header + entries + blobs


def strip(sizes, pad=26, bg=(0x16, 0x1A, 0x25)):
    h = max(sizes) + pad * 2
    w = pad + sum(s + pad for s in sizes)
    canvas = [[(bg[0], bg[1], bg[2], 255)] * w for _ in range(h)]
    cx = pad
    for s in sizes:
        rgba = render(s)
        top = (h - s) // 2
        for yy in range(s):
            for xx in range(s):
                i = (yy * s + xx) * 4
                r, g, b, a = rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]
                if a == 0:
                    continue
                af = a / 255.0
                dr, dg, db, _ = canvas[top + yy][cx + xx]
                canvas[top + yy][cx + xx] = (
                    int(r * af + dr * (1 - af)), int(g * af + dg * (1 - af)),
                    int(b * af + db * (1 - af)), 255)
        cx += s + pad
    flat = bytearray()
    for row in canvas:
        for px in row:
            flat += bytes(px)
    return png_bytes(w, h, bytes(flat))


if __name__ == "__main__":
    made = []
    for s in (16, 32, 48, 180, 512):
        data = png_bytes(s, s, render(s))
        open("favicon-%d.png" % s, "wb").write(data)
        made.append((s, data))
        print("wrote favicon-%d.png %d bytes" % (s, len(data)))

    ico = ico_bytes([(s, d) for s, d in made if s in (16, 32, 48)])
    open("favicon.ico", "wb").write(ico)
    print("wrote favicon.ico", len(ico), "bytes")

    open("icon-preview.png", "wb").write(strip([16, 32, 64, 128]))
    print("wrote icon-preview.png")
