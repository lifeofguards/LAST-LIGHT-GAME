// Input: keyboard state, per-frame presses, mouse look deltas, mouse buttons, pointer lock.
export function createInput(G) {
  const down = new Set();
  const pressed = new Set();
  let mouseDX = 0, mouseDY = 0;
  let clicks = { left: 0, right: 0 };
  let mouseHeld = false;
  let wheel = 0;
  const el = G.renderer.domElement;

  const input = {
    locked: false,
    down: (code) => down.has(code),
    pressed: (code) => pressed.has(code),
    consumeMouse() { const d = [mouseDX, mouseDY]; mouseDX = 0; mouseDY = 0; return d; },
    consumeWheel() { const w = wheel; wheel = 0; return w; },
    clicked: (b = 'left') => clicks[b] > 0,
    get mouseHeld() { return mouseHeld; },
    endFrame() { pressed.clear(); clicks.left = 0; clicks.right = 0; },
    requestLock() { try { const r = el.requestPointerLock?.(); if (r && r.catch) r.catch(() => {}); } catch (e) {} },
    exitLock() { try { document.exitPointerLock?.(); } catch (e) {} },
  };

  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    G.events.emit('gesture');
  });
  addEventListener('keyup', (e) => down.delete(e.code));
  addEventListener('blur', () => down.clear());

  // Synthetic (untrusted) mousemoves are accepted without pointer lock so headless harnesses can look around.
  document.addEventListener('mousemove', (e) => {
    if (input.locked || !e.isTrusted) { mouseDX += e.movementX || 0; mouseDY += e.movementY || 0; }
  });
  el.addEventListener('mousedown', (e) => {
    G.events.emit('gesture');
    if (G.mode === 'playing' && !input.locked && e.isTrusted) input.requestLock();
    if (e.button === 0) { clicks.left++; mouseHeld = true; }
    if (e.button === 2) clicks.right++;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (e.altKey || e.ctrlKey || e.metaKey) return; /* modifier+wheel = hotbar (survival.js); plain wheel = zoom only */ wheel += Math.max(-300, Math.min(300, e.deltaY)); e.preventDefault(); }, { passive: false });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === el; });
  return input;
}
