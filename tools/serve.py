#!/usr/bin/env python3
"""Preview docs/ locally, the way GitHub Pages will serve it.

    python3 -m tools.serve            ->  http://localhost:8765

Development-only extras, which GitHub Pages never sees:

  /__tools/icons.html   previews the favicon at real sizes and renders every
                        PNG and the ICO from favicon.svg
  POST /__capture       saves a rendered file into docs/assets. ?name= picks
                        one of the files in SAVES; without it, the social card
"""

import http.server
import pathlib
import sys
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent / "docs"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

ICONS = ROOT / "assets" / "icons"
SAVES = {
    "og-image.jpg": ROOT / "assets" / "img" / "og-image.jpg",
    "favicon-16.png": ICONS / "favicon-16.png",
    "favicon-32.png": ICONS / "favicon-32.png",
    "favicon-48.png": ICONS / "favicon-48.png",
    "favicon-180.png": ICONS / "favicon-180.png",
    "favicon-512.png": ICONS / "favicon-512.png",
    "favicon.ico": ICONS / "favicon.ico",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
        ".woff2": "font/woff2",
    }

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def translate_path(self, path):
        clean = urllib.parse.urlparse(path).path
        if clean.startswith("/__tools/"):
            return str(HERE / clean[len("/__tools/"):])
        return super().translate_path(path)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/__capture":
            self.send_error(404)
            return
        name = urllib.parse.parse_qs(url.query).get("name", ["og-image.jpg"])[0]
        out = SAVES.get(name)
        if out is None:
            self.send_error(400, "unknown name")
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        out.write_bytes(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"saved %s, %d bytes" % (name.encode(), len(data)))

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    # threaded, with a deep accept queue: a browser opens ~20 parallel
    # connections for the module graph, and the default backlog of 5 resets them
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    http.server.ThreadingHTTPServer.request_queue_size = 128
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("serving docs/ at http://localhost:%d" % PORT)
        httpd.serve_forever()
