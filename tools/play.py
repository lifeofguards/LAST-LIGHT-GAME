#!/usr/bin/env python3
"""Headless-Chrome play harness for LAST LIGHT (parallel-safe: own port + profile per run).

Usage: python3 forest/tools/play.py steps.json [--url URL] [--w 1280 --h 720]
steps.json is a list of steps:
  {"wait": 1500}                         wait ms (real time)
  {"key": "KeyW", "hold": 800}           hold a key (KeyboardEvent.code) for ms
  {"press": "KeyE"}                      tap a key
  {"click": [640,360], "button": "left"} mouse click at pixel
  {"move": [dx, dy]}                     relative mouse move (pointer-lock look), sent as mousemove movementX/Y
  {"eval": "js expression"}              runs in page, result printed as JSON
  {"shot": "forest/shots/name.png"}      screenshot
Console errors / exceptions are printed at the end.
Default URL: http://127.0.0.1:8790/index.html
"""
import base64, json, os, random, socket, struct, subprocess, sys, tempfile, time, urllib.request

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

class WS:
    def __init__(self, url):
        assert url.startswith("ws://")
        rest = url[5:]; hostport, path = rest.split("/", 1)
        host, port = hostport.split(":")
        self.s = socket.create_connection((host, int(port)), timeout=60)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.s.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf: buf += self.s.recv(4096)
        self.buf = buf.split(b"\r\n\r\n", 1)[1]
    def send(self, text):
        data = text.encode(); n = len(data)
        hdr = bytearray([0x81])
        if n < 126: hdr.append(0x80 | n)
        elif n < 65536: hdr.append(0x80 | 126); hdr += struct.pack(">H", n)
        else: hdr.append(0x80 | 127); hdr += struct.pack(">Q", n)
        mask = os.urandom(4); hdr += mask
        self.s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))
    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(1 << 20)
            if not chunk: raise EOFError
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]; return out
    def recv(self):
        msg = b""
        while True:
            b0, b1 = self._read(2); n = b1 & 0x7F
            if n == 126: n = struct.unpack(">H", self._read(2))[0]
            elif n == 127: n = struct.unpack(">Q", self._read(8))[0]
            payload = self._read(n); msg += payload
            if b0 & 0x80: return msg.decode("utf-8", "replace")

class CDP:
    def __init__(self, ws):
        self.ws, self.id, self.events = ws, 0, []
    def call(self, method, **params):
        self.id += 1; mid = self.id
        self.ws.send(json.dumps({"id": mid, "method": method, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == mid:
                if "error" in m: raise RuntimeError(m["error"])
                return m.get("result", {})
            self.events.append(m)

def main():
    args = sys.argv[1:]
    steps_path = args[0]
    url = "http://127.0.0.1:8790/index.html"; w, h = 1280, 720
    if "--url" in args: url = args[args.index("--url") + 1]
    if "--w" in args: w = int(args[args.index("--w") + 1])
    if "--h" in args: h = int(args[args.index("--h") + 1])
    steps = json.load(open(steps_path))
    port = random.randint(20000, 40000)
    prof = tempfile.mkdtemp(prefix="lastlight-")
    proc = subprocess.Popen([CHROME, "--headless=new", f"--remote-debugging-port={port}", f"--user-data-dir={prof}",
        f"--window-size={w},{h}", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist",
        "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--mute-audio", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f"http://127.0.0.1:{port}/json")); break
            except Exception: time.sleep(0.1)
        page = [t for t in tabs if t.get("type") == "page"][0]
        cdp = CDP(WS(page["webSocketDebuggerUrl"]))
        cdp.call("Runtime.enable"); cdp.call("Page.enable"); cdp.call("Log.enable")
        cdp.call("Emulation.setDeviceMetricsOverride", width=w, height=h, deviceScaleFactor=1, mobile=False)
        cdp.call("Page.navigate", url=url); time.sleep(2.5)
        mx, my = w // 2, h // 2
        for st in steps:
            if "wait" in st: time.sleep(st["wait"] / 1000)
            elif "key" in st or "press" in st:
                code = st.get("key") or st.get("press")
                keyname = code[3:].lower() if code.startswith("Key") else {"Space": " ", "ShiftLeft": "Shift", "Escape": "Escape", "Enter": "Enter"}.get(code, code)
                cdp.call("Input.dispatchKeyEvent", type="keyDown", code=code, key=keyname)
                time.sleep(st.get("hold", 60) / 1000)
                cdp.call("Input.dispatchKeyEvent", type="keyUp", code=code, key=keyname)
            elif "click" in st:
                x, y = st["click"]; b = st.get("button", "left")
                cdp.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button=b, clickCount=1)
                time.sleep(st.get("hold", 60) / 1000)
                cdp.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button=b, clickCount=1)
            elif "move" in st:
                dx, dy = st["move"]
                r = cdp.call("Runtime.evaluate", expression=f"document.dispatchEvent(new MouseEvent('mousemove',{{movementX:{dx},movementY:{dy},bubbles:true}}));window.dispatchEvent(new MouseEvent('mousemove',{{movementX:{dx},movementY:{dy}}}));1")
            elif "eval" in st:
                r = cdp.call("Runtime.evaluate", expression=st["eval"], returnByValue=True, awaitPromise=True)
                print("EVAL", st["eval"][:80], "=>", json.dumps(r.get("result", {}).get("value"))[:4000])
            elif "shot" in st:
                r = cdp.call("Page.captureScreenshot", format="png")
                os.makedirs(os.path.dirname(os.path.abspath(st["shot"])), exist_ok=True)
                open(st["shot"], "wb").write(base64.b64decode(r["data"])); print("SHOT", st["shot"])
        cdp.call("Runtime.evaluate", expression="1")
        errs = [e for e in cdp.events if e.get("method") in ("Runtime.exceptionThrown",) or
                (e.get("method") == "Runtime.consoleAPICalled" and e["params"].get("type") in ("error", "warning")) or
                (e.get("method") == "Log.entryAdded" and e["params"]["entry"].get("level") == "error")]
        for e in errs[:30]: print("CONSOLE", json.dumps(e.get("params"))[:600])
        if not errs: print("CONSOLE clean")
    finally:
        proc.kill()

if __name__ == "__main__":
    main()
