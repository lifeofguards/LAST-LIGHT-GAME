// UI: HTML/CSS overlay HUD, title card, prompts, toasts, title/death/win screens.
const ICON = {
  heart: '<svg viewBox="0 0 24 24"><path fill="#ff6b5b" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/></svg>',
  food: '<svg viewBox="0 0 24 24"><circle cx="9" cy="14" r="5" fill="#e0314a"/><circle cx="15.5" cy="12" r="4.5" fill="#c9243c"/><path d="M12 7c1-3 3-4 5-4" stroke="#5a8d3a" stroke-width="2" fill="none"/></svg>',
  stam: '<svg viewBox="0 0 24 24"><path fill="#8fe0ff" d="M13 2 4 14h7l-2 8 9-12h-7z"/></svg>',
  fire: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#ff7a2a" d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-6 1-9z"/><path fill="#ffd060" d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5z"/></svg>',
  axe: '<svg viewBox="0 0 40 40"><rect x="18" y="6" width="4" height="30" rx="1.5" fill="#a86b3a" transform="rotate(35 20 20)"/><path d="M20 4c6 0 11 4 12 9l-11 3z" fill="#c9ced3" transform="rotate(35 20 20)"/></svg>',
  flashlight: '<svg viewBox="0 0 40 40"><rect x="6" y="16" width="20" height="9" rx="2" fill="#3a3f46"/><path d="M26 13h6v15h-6z" fill="#59606a"/><path d="M32 14l6-4v21l-6-4z" fill="#ffe9a8" opacity=".8"/></svg>',
  sack: '<svg viewBox="0 0 40 40"><path d="M14 10h12l-2 4c6 3 9 8 9 13 0 6-6 9-13 9S7 33 7 27c0-5 3-10 9-13z" fill="#9b7a4c"/><rect x="15" y="9" width="10" height="3" rx="1" fill="#5b4630"/></svg>',
  sun: '<svg viewBox="0 0 24 24" width="24" height="24"><circle cx="12" cy="12" r="5" fill="#ffd36b"/><g stroke="#ffd36b" stroke-width="2">' + [0, 45, 90, 135, 180, 225, 270, 315].map(a => `<line x1="12" y1="2" x2="12" y2="5" transform="rotate(${a} 12 12)"/>`).join('') + '</g></svg>',
  moon: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="#cdd8ff" d="M15 3a9 9 0 1 0 6 13A7 7 0 0 1 15 3z"/></svg>',
};

export function createUI(G) {
  const root = document.getElementById('ui');
  root.innerHTML = `
  <div id="hud" class="hidden">
    <div id="vignette"></div><div id="lowhp"></div><div id="hurt"></div><div id="hurtflash"></div><div id="dmgnum"></div><div id="lowhptag">LOW HEALTH · get to the fire, eat berries</div><div id="crosshair"></div><div id="hitmark"></div><div id="treehp"><span id="treehpl">Tree</span><div id="treepips"></div></div>
    <div id="topbar"><div id="phase"><span id="phaseicon"></span><span id="phasetxt">DAY 1</span></div>
      <div id="cyclebar"><div id="cyclefill"></div></div><div id="clock">06:00</div><div id="nights">${'<i></i>'.repeat(5)}</div></div>
    <div id="fire">${ICON.fire}<div class="fcol"><div class="lbl"><span>Campfire</span><span id="firestat">Burning</span></div><div class="bar"><div id="firefill"></div></div></div></div>
    <div id="threatv"></div>
    <div id="goal"><div class="gh">OBJECTIVE</div><div id="goaltxt"></div><div id="goalsub"></div></div>
    <div id="firemark"><div class="fmb"><i id="firearrow"></i>${ICON.fire}</div><span id="firedist"></span></div>
    <div id="stats">
      <div class="stat" id="st-hp">${ICON.heart}<div class="bar"><div class="fill" id="hpfill"></div><span class="bl">Health</span><span class="bv" id="hpv">100</span></div></div>
      <div class="stat" id="st-hunger">${ICON.food}<div class="bar"><div class="fill" id="hungerfill"></div><span class="bl">Hunger</span><span class="bv" id="hungerv">100</span></div></div>
      <div class="stat" id="st-stam">${ICON.stam}<div class="bar"><div class="fill" id="stamfill"></div><span class="bl">Stamina</span></div></div>
    </div>
    <div id="berryhint" class="hidden"></div>
    <div id="itemname"></div>
    <div id="prompt" class="hidden"></div>
    <div id="hotbar">
      <div class="slot" data-item="axe"><span class="num">1</span>${ICON.axe}<span class="nm">Axe</span></div>
      <div class="slot" data-item="flashlight"><span class="num">2</span>${ICON.flashlight}<div class="bat"><div id="batfill"></div></div><span class="nm">Light <em>F</em></span></div>
      <div class="slot" data-item="sack"><span class="num">3</span>${ICON.sack}<span class="cnt" id="logcnt">0/5</span><span class="nm">Sack</span></div>
    </div>
    <div id="toast"></div>
    <div id="card"><h1 id="cardh"></h1><p id="cardp"></p></div>
  </div>
  <div id="title" class="screen">
    <h1>LAST LIGHT</h1>
    <div class="tag">Keep the fire burning. How many nights can you survive?</div>
    <div class="steps">
      <div class="step"><div class="sn">1</div>${ICON.axe}<b>Chop trees</b><span>Walk up to a tree and press E (or click). Trees drop logs.</span></div>
      <div class="step"><div class="sn">2</div>${ICON.fire}<b>Feed the fire</b><span>Press E at the campfire to add logs.</span></div>
      <div class="step"><div class="sn">3</div>${ICON.moon}<b>Stay in the light</b><span>The dark is not safe. Shine your flashlight (F) at glowing eyes.</span></div>
    </div>
    <button class="btn" id="playbtn">PLAY</button>
    <div class="keys">
      <span><b>WASD</b> move</span><span><b>Mouse</b> look</span>
      <span><b>Shift</b> sprint</span><span><b>Space</b> jump</span>
      <span><b>Click</b> use item</span><span><b>E</b> interact</span>
      <span><b>1 2 3</b> axe / light / sack</span><span><b>F</b> flashlight</span>
      <span><b>Q</b> eat berries</span><span><b>M</b> mute</span>
    </div>
  </div>
  <div id="death" class="screen hidden"><h1>YOU DIED</h1><div class="big"><span id="deathn">0</span><small>nights survived</small></div><p id="deathmsg"></p><p id="deathbest" class="best"></p><div id="deathtip" class="tip"></div><button class="btn" id="retry">TRY AGAIN</button><div class="hint">or press <b>R</b></div></div>
  <div id="win" class="screen hidden"><h1>YOU SURVIVED</h1><div class="big"><span>5</span><small>nights survived</small></div><p id="winmsg">The sun rises and the forest goes quiet. The fire kept you alive.</p><button class="btn" id="again">PLAY AGAIN</button><div class="hint">or press <b>R</b></div></div>`;
  const $ = (id) => document.getElementById(id);
  const el = { hud: $('hud'), title: $('title'), death: $('death'), win: $('win'), hurt: $('hurt'), prompt: $('prompt'), card: $('card'), toast: $('toast'), itemname: $('itemname') };
  const restart = () => { location.href = location.pathname + '?play=1'; };
  $('playbtn').addEventListener('click', () => G.startGame());
  $('retry').addEventListener('click', restart); $('again').addEventListener('click', restart);
  addEventListener('keydown', (e) => { if (e.code === 'KeyR' && (G.mode === 'dead' || G.mode === 'won') && (!el.death.classList.contains('hidden') || !el.win.classList.contains('hidden'))) restart(); if ((e.code === 'Enter' || e.code === 'Space') && G.mode === 'title') G.startGame(); });
  const slots = [...root.querySelectorAll('.slot')];

  let dmgT = 0, dmgSum = 0, toastQ = null;
  let prevFuel = -1, cardStart = -1e9, cardFade = 0, meterA = 0, chopTree = null, treeHpT = 0, hitT = 0, cardT = 0, toastT = 0, itemT = 0, hurt = 0;
  const ui = {
    showCard(h, p, cls = '') { toastQ = null; toastT = 0; el.toast.style.opacity = 0; el.toast.textContent = ''; dmgT = 0; $('dmgnum').classList.remove('go'); document.body.classList.add('cardup'); $('cardh').textContent = h; $('cardp').textContent = p || ''; el.card.className = cls; el.card.style.transition = 'none'; el.card.style.opacity = ''; void el.card.offsetWidth; el.card.classList.add('go'); cardStart = performance.now(); cardT = 1; cardFade = 1; },
    toast(msg, secs = 2.5) { if (cardT > 0 || document.body.classList.contains('cardup')) { toastQ = [msg, secs]; return; } el.toast.textContent = msg; el.toast.style.opacity = 1; toastT = secs; },
    startPlaying() { el.title.classList.add('hidden'); el.hud.classList.remove('hidden'); },
    showDeath(nights, cause) {
      el.hud.classList.add('hidden'); el.death.classList.remove('hidden'); $('deathn').textContent = nights;
      const c = String(cause || '').toLowerCase();
      $('deathmsg').textContent = (!cause || c === 'debug' ? 'The forest took you.' : /starv|hunger/.test(c) ? 'You starved.' : `Killed by ${/^(the |a )/i.test(cause) ? cause : 'the ' + cause}.`);
      $('death').querySelector('.big small').textContent = nights === 1 ? 'night survived' : 'nights survived';
      let best = 0; try { best = +localStorage.getItem('lastlight.best') || 0; if (nights > best) localStorage.setItem('lastlight.best', String(nights)); } catch (e) {}
      $('deathbest').textContent = nights > best ? (best > 0 ? `New record! Your old best was ${best}.` : '') : `Your best: ${best} ${best === 1 ? 'night' : 'nights'}.`;
      $('deathtip').textContent = /deer/.test(c) ? 'Tip: the Deer freezes when your flashlight is on it. Never let the fire die at night.'
        : /bear/.test(c) ? 'Tip: hit the bear with the axe, or run into the fire\'s light. It won\'t follow you there.'
        : /hunger|starv/.test(c) ? 'Tip: berry bushes near camp refill hunger (E on a bush). Hit rabbits with the axe and cook the meat by the fire for a big meal.'
        : 'Tip: keep the fire fed and stay inside its light after dark.';
    },
    showWin() { el.hud.classList.add('hidden'); el.win.classList.remove('hidden'); },
    flashHurt(a = 1) { hurt = Math.max(hurt, a); },
  };
  G.events.on('equip', ({ item }) => { el.itemname.textContent = { axe: 'Old Axe', flashlight: 'Flashlight', sack: 'Log Sack' }[item]; el.itemname.style.opacity = 1; itemT = 1.2; });
  G.events.on('damage', ({ amount }) => {
    ui.flashHurt(Math.min(1, 0.6 + amount / 30));
    const hf = $('hurtflash'); hf.classList.remove('go'); void hf.offsetWidth; hf.classList.add('go');
    // screen-anchored damage number (sits just above the health bar, stacks rapid hits)
    dmgSum = dmgT > 0 ? dmgSum + amount : amount; dmgT = 1.6;
    const dn = $('dmgnum'); dn.textContent = '-' + Math.round(dmgSum) + ' HP'; dn.classList.remove('go'); void dn.offsetWidth; dn.classList.add('go');
    if (G.controls) G.controls.shake = Math.max(G.controls.shake || 0, Math.min(0.6, 0.3 + amount / 50));
    el.hud.classList.remove('hudshake'); void el.hud.offsetWidth; el.hud.classList.add('hudshake');
  });
  G.events.on('fireOut', () => { if (G.mode === 'playing') ui.toast(G.daynight.phase === 'night' ? 'The fire went out... something is coming.' : 'The fire went out! Add logs to relight it.', 3.5); });
  G.events.on('flashlightDead', () => ui.toast('Flashlight battery is dead. Recharge it by the fire.'));
  G.events.on('bearDeath', () => ui.toast('The bear falls.'));
  G.events.on('nightStart', () => { if (el.toast.textContent.startsWith('It\'s getting dark')) toastT = Math.min(toastT, 0.01); });

  let lastLowFire = 0, duskWarned = -1, threatV = 0;
  const v3 = new G.THREE.Vector3(), fwd = new G.THREE.Vector3();
  const stepsDone = { chop: false, feed: false };
  G.events.on('treeFall', ({ tree }) => { stepsDone.chop = true; showTreeHp(tree); ui.toast(`TIMBER! The tree dropped ${tree?.logs || 2} logs. Press E to pick them up.`, 3); });
  // tree hit feedback: crosshair hit-marker pop + a hits-left pip bar so the first swing visibly "works"
  const showTreeHp = (t) => {
    if (!t) return; const max = t.maxHp || 4, hp = Math.max(0, t.hp);
    $('treepips').innerHTML = Array.from({ length: max }, (_, i) => `<i class="${i < hp ? 'on' : ''}"></i>`).join('');
    $('treehpl').textContent = hp <= 0 ? 'TIMBER!' : `Tree · ${hp} hit${hp === 1 ? '' : 's'} left`;
    const th = $('treehp'); th.classList.remove('pop'); void th.offsetWidth; th.classList.add('pop'); th.style.opacity = 1; treeHpT = hp <= 0 ? 2.2 : 1.8;
  };
  G.events.on('treeHit', ({ tree, split }) => {
    if (split) return;
    const hm = $('hitmark'); hm.classList.remove('pop'); void hm.offsetWidth; hm.classList.add('pop'); hitT = 0.35;
    if (tree && tree.hp > 0) showTreeHp(tree);
  });
  G.events.on('pickup', () => { stepsDone.chop = true; });
  G.events.on('fireFed', () => { stepsDone.feed = true; });
  const setGoal = (t, sub = '') => { if ($('goaltxt').textContent !== t) { $('goaltxt').textContent = t; const g = $('goal'); g.classList.remove('pop'); void g.offsetWidth; g.classList.add('pop'); } $('goalsub').textContent = sub; };
  ui.update = (dt) => {
    hurt = Math.max(0, hurt - dt * 0.8);
    const st = G.survival.stats;
    el.hurt.style.opacity = hurt.toFixed(3);
    if (dmgT > 0) dmgT -= dt;
    // persistent low-health state: heartbeat-rhythm red pulse (lub-dub), stronger and faster the closer to death
    const low = G.mode === 'playing' && st.health > 0 && st.health < 30 ? 1 - st.health / 30 : 0;
    let lp = 0;
    if (low > 0) { const bps = (70 + low * 60) / 60, ph = (G.time * bps) % 1; lp = Math.exp(-ph * 14) + 0.7 * Math.exp(-Math.max(0, ph - 0.2) * 14) * (ph > 0.2 ? 1 : 0); }
    $('lowhp').style.opacity = low > 0 ? Math.min(1, 0.45 + low * 0.35 + lp * 0.3).toFixed(3) : 0;
    $('lowhptag').style.opacity = low > 0 ? (0.7 + lp * 0.3).toFixed(3) : 0;
    document.body.classList.toggle('lowhp', low > 0);
    // phase card runs on a fixed WALL-CLOCK timer (CSS keyframes), independent of frame rate, damage or game dt:
    // 0.4s fade in, ~1.6s hold centred, then it shrinks up and docks under the clock, then fades. Centre is free after ~2.2s.
    if (el.card.classList.contains('go')) { const age = (performance.now() - cardStart) / 1000; cardT = age < 2.1 ? 1 : 0; if (age > 5) { el.card.classList.remove('go'); cardT = 0; } } else cardT = 0;
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.style.opacity = 0; }
    if (itemT > 0) { itemT -= dt; if (itemT <= 0) el.itemname.style.opacity = 0; }
    if (treeHpT > 0) { treeHpT -= dt; if (treeHpT <= 0) $('treehp').style.opacity = 0; }
    // the fire's world-space fuel pill lives in the 3D canvas, so it would show through every overlay:
    // fade it out whenever the title / death / win screens or the DAY N / NIGHT N card are up
    cardFade = cardT > 0 ? 1 : 0;
    const overlayUp = G.mode !== 'playing' || cardFade > 0 || el.hud.classList.contains('hidden');
    document.body.classList.toggle('cardup', cardFade > 0);
    // queued toast (arrived while the card owned the center) plays once the card is gone, if still relevant
    if (!cardFade && toastQ && G.mode === 'playing') { const [m, sc] = toastQ; toastQ = null; ui.toast(m, Math.min(sc, 3)); }
    meterA += ((overlayUp ? 0 : 1) - meterA) * Math.min(1, dt * (overlayUp ? 14 : 3));
    const mtr = G.campfire && G.campfire.meter;
    if (mtr) { mtr.material.opacity = meterA; mtr.visible = meterA > 0.02; }
    if (G.mode !== 'playing') return;
    const dn = G.daynight, night = dn.phase === 'night';
    $('phasetxt').textContent = night ? `NIGHT ${dn.night}` : `DAY ${dn.day}`;
    $('phaseicon').innerHTML = night ? ICON.moon : ICON.sun;
    $('clock').textContent = `${dn.clock()}  ·  ${night ? 'dawn' : 'dusk'} in ${Math.ceil(dn.timeLeft())}s`;
    const cf = $('cyclefill'); cf.style.width = (dn.phaseProgress() * 100).toFixed(1) + '%'; cf.className = night ? 'night' : '';
    [...$('nights').children].forEach((n, i) => n.className = i < dn.night - (night ? 1 : 0) ? 'done' : (night && i === dn.night - 1 ? 'now' : ''));
    const fuel = G.campfire.fuel; $('firefill').style.width = fuel + '%';
    $('firestat').textContent = fuel <= 0 ? 'OUT' : fuel < 25 ? 'Dying' : fuel < 60 ? 'Burning' : 'Roaring';
    $('fire').classList.toggle('out', fuel <= 0);
    $('fire').classList.toggle('low', fuel < 25);
    if (fuel < 20 && fuel > 0 && G.time - lastLowFire > 25) { lastLowFire = G.time; ui.toast('The fire is dying! Feed it logs.'); }
    $('hpv').textContent = Math.ceil(st.health); $('hungerv').textContent = Math.ceil(st.hunger);
    $('hpfill').style.width = st.health + '%'; $('hungerfill').style.width = st.hunger + '%'; $('stamfill').style.width = st.stamina + '%';
    $('st-hp').classList.toggle('warn', st.health < 30); $('st-hunger').classList.toggle('warn', st.hunger < 20);
    slots.forEach(s => s.classList.toggle('sel', s.dataset.item === G.survival.equipped));
    slots[1].classList.toggle('lit', G.flashlight.on); slots[2].classList.toggle('full', G.survival.inventory.logs >= G.world.logMax);
    $('logcnt').textContent = `${G.survival.inventory.logs}/${G.world.logMax}`;
    const bat = G.flashlight.battery; $('batfill').style.width = bat + '%'; $('batfill').style.background = bat < 20 ? '#ff5a4a' : bat < 50 ? '#ffc247' : '#9df27a';
    const fh = G.survival.foodHint ? G.survival.foodHint() : '', bh = $('berryhint'); bh.classList.toggle('hidden', !fh); if (fh && bh.innerHTML !== fh) bh.innerHTML = fh;
    // objective tracker: always tells a new player the next thing to do
    const inv = G.survival.inventory, fire = G.campfire, pp = G.controls.pos;
    const fireD = Math.hypot(pp.x - fire.x, pp.z - fire.z), inLight = fire.inLight(pp);
    if (fuel > 0 && fuel < 100 && prevFuel >= 0 && fuel > prevFuel + 3) stepsDone.feed = true;
    prevFuel = fuel;
    if (inv.logs > 0) stepsDone.chop = true;
    if (night) {
      if (fuel <= 0) setGoal('The fire is out! Relight it with logs', 'Keep your flashlight on the Deer');
      else if (!inLight) setGoal('Get back to the fire\'s light', `${Math.round(fireD)}m away · shine your flashlight (F) at threats`);
      else if (inv.logs > 0 && fuel < 85) setGoal('Feed the fire', `[E] at the campfire · ${inv.logs} log${inv.logs === 1 ? '' : 's'} in sack`);
      else setGoal(`Survive night ${dn.night}`, `Stay in the light · dawn in ${Math.ceil(dn.timeLeft())}s`);
    } else {
      if (inv.logs >= G.world.logMax) setGoal('Sack full: bring logs to the fire', fireD > 6 ? `Campfire ${Math.round(fireD)}m away` : '[E] at the campfire to add a log');
      else if (inv.logs > 0 && (fuel < 60 || fireD < 10)) setGoal('Add logs to the campfire', `[E] at the fire · ${inv.logs}/${G.world.logMax} in sack`);
      else if (!stepsDone.chop) setGoal('Chop a tree for logs', 'Walk up to a tree · click or [E] to swing the axe');
      else if (!stepsDone.feed) setGoal('Pick up logs and feed the fire', '[E] to pick up · [E] at the fire');
      else if (st.hunger < 40) setGoal('Eat something', 'Red berry bushes grow out in the forest · [E] to pick');
      else setGoal(`Stock up before night ${dn.night + 1}`, `Gather logs · night in ${Math.ceil(dn.timeLeft())}s`);
      const tl = dn.timeLeft();
      // dusk banner stays up until the exact moment NIGHT N fires (darkness curve is keyed to the same timer)
      if (tl < 18 && duskWarned !== dn.day) { duskWarned = dn.day; ui.toast('It\'s getting dark... head back to the fire.', tl + 0.1); }
    }
    // campfire beacon: ALWAYS on screen (pin over the fire, or pinned to the screen edge with an arrow).
    // Never hidden when the fire dies: that is exactly when the player needs it most.
    const fm = $('firemark'), out = fuel <= 0;
    if (fireD > (out ? 3 : 7)) {
      const cam = G.camera; cam.getWorldDirection(fwd);
      const fl = Math.hypot(fwd.x, fwd.z) || 1, fx = fwd.x / fl, fz = fwd.z / fl;
      const dx = fire.x - cam.position.x, dz = fire.z - cam.position.z;
      const ang = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz); // 0 = straight ahead, + = right
      v3.set(fire.x, 3.2, fire.z).project(cam);
      let x = v3.x, y = v3.y;
      const onScreen = v3.z < 1 && Math.abs(x) < 0.86 && y < 0.6 && y > -0.55;
      if (!onScreen) {
        let sx = Math.sin(ang), sy = Math.cos(ang);
        const k = Math.max(Math.abs(sx) / 0.88, sy > 0 ? sy / 0.6 : -sy / 0.5, 1e-3); x = sx / k; y = sy / k;
        if (y < -0.4) { y = -0.4; x = (sx >= 0 ? 1 : -1) * 0.88; } // behind: park on the side edge, clear of hotbar/prompt
      }
      fm.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px'; fm.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px';
      fm.classList.remove('hidden'); fm.classList.toggle('edge', !onScreen); fm.classList.toggle('out', out);
      fm.classList.toggle('urgent', night && (out || !inLight));
      $('firearrow').style.transform = `rotate(${Math.atan2(-Math.cos(ang), Math.sin(ang))}rad) translateX(29px)`;
      $('firedist').textContent = (out ? 'FIRE OUT · ' : '') + Math.round(fireD) + 'm';
    } else fm.classList.add('hidden');
    // threat vignette: dark pulsing edges as danger rises
    threatV += ((G.threat || 0) - threatV) * Math.min(1, dt * 3);
    $('threatv').style.opacity = (threatV * (0.75 + Math.sin(G.time * 7) * 0.25)).toFixed(3);
    document.body.classList.toggle('isnight', night);
    let it = G.interaction;
    // chop prompt: looking at a tree in reach and nothing else to interact with -> "E Chop tree" (E or click swings)
    chopTree = null;
    if (!it || it.disabled) {
      G.camera.getWorldDirection(fwd); const fl = Math.hypot(fwd.x, fwd.z) || 1;
      const t = G.world.findChopTarget && G.world.findChopTarget(pp.x, pp.z, fwd.x / fl, fwd.z / fl, 3.0);
      if (t && t.alive) {
        chopTree = t; const max = t.maxHp || 4, hp = Math.max(0, t.hp);
        const axe = G.survival.equipped === 'axe';
        it = { label: `[E] Chop tree${axe ? '' : ' (equips axe)'}  <span class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < hp ? 'on' : ''}"></i>`).join('')}</span>` };
        if (G.input.pressed('KeyE')) { if (!axe) G.survival.equip('axe'); G.controls.swingQueued = 0.6; G.controls.faceCamT = 0.7; }
      }
    }
    $('crosshair').classList.toggle('tree', !!chopTree);
    if (it) { el.prompt.classList.remove('hidden'); el.prompt.classList.toggle('dis', !!it.disabled); el.prompt.innerHTML = it.label.replace(/^\[E\]/, '<b>E</b>'); }
    else el.prompt.classList.add('hidden');
  };
  return ui;
}
