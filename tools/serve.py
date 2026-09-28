#!/usr/bin/env python3
"""Gauntlet AI dev server.

- Serves the game statically with aggressive no-cache headers (agents must always
  see the newest code, never a stale module).
- POST /capture  {name, data}  -> writes captures/<name>.png  (canvas frames from
  critic agents running scripted scenarios in a headless-ish browser tab)
- POST /report   {name, data}  -> writes reports/<name>.json  (telemetry dumps)
- GET  /health                 -> {"ok":true}
"""
import base64, json, os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAFE = re.compile(r'[^A-Za-z0-9_.-]')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/health'):
            return self._json(200, {'ok': True})
        if self.path.startswith('/captures.json'):
            d = os.path.join(ROOT, 'captures')
            items = []
            if os.path.isdir(d):
                for f in os.listdir(d):
                    if f.endswith('.png'):
                        p = os.path.join(d, f)
                        items.append({'name': f, 'mtime': os.path.getmtime(p), 'bytes': os.path.getsize(p)})
            items.sort(key=lambda x: -x['mtime'])
            return self._json(200, {'ok': True, 'items': items})
        return super().do_GET()

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            payload = json.loads(self.rfile.read(n) or b'{}')
        except Exception as e:
            return self._json(400, {'ok': False, 'error': str(e)})

        name = SAFE.sub('_', str(payload.get('name', 'frame')))[:120] or 'frame'

        if self.path.startswith('/capture'):
            data = payload.get('data', '')
            if ',' in data:
                data = data.split(',', 1)[1]
            outdir = os.path.join(ROOT, 'captures')
            os.makedirs(outdir, exist_ok=True)
            path = os.path.join(outdir, name + '.png')
            with open(path, 'wb') as f:
                f.write(base64.b64decode(data))
            return self._json(200, {'ok': True, 'path': path, 'bytes': os.path.getsize(path)})

        if self.path.startswith('/report'):
            outdir = os.path.join(ROOT, 'reports')
            os.makedirs(outdir, exist_ok=True)
            path = os.path.join(outdir, name + '.json')
            with open(path, 'w') as f:
                json.dump(payload.get('data', {}), f, indent=2)
            return self._json(200, {'ok': True, 'path': path})

        return self._json(404, {'ok': False})

    def log_message(self, fmt, *args):
        pass  # quiet

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
